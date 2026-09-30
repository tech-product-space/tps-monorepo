const { CohortMember, users, sequelize } = require("../models");
const { Op } = require("sequelize");
const { Readable } = require("stream");
const { getPaginationParams, getMeta } = require("../utils/pagination");
const validateEmail = require("../utils/validators/validateEmail");
const csv = require("csv-parser");

// POST /cohort-members
exports.createCohortMember = async (req, res, next) => {
  const { name, email, phone, course, cohort, role, status, additional_data } =
    req.body;

  if (!name || !email || !course || !cohort || !role || !status) {
    return res.status(400).json({
      message: "Missing required fields",
    });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({
      message: "Invalid email address",
    });
  }

  const transaction = await sequelize.transaction();

  try {
    // find or create user
    let user = await users.findOne({
      where: { email },
      transaction,
    });

    const normalizedEmail = email.trim();

    if (!user) {
      user = await users.create(
        {
          name: name.trim(),
          email: normalizedEmail,
          phone: phone?.trim(),
        },
        { transaction }
      );
    } else if (!user.phone && phone) {
      user.phone = phone;
      await user.save({ transaction });
    }

    // check existing membership
    const existingMember = await CohortMember.findOne({
      where: {
        userId: user.id,
        course,
        cohort,
      },
      transaction,
    });

    if (existingMember) {
      return res.status(409).json({
        message: "User already exists in this cohort and course",
      });
    }

    // create cohort member
    const member = await CohortMember.create(
      {
        userId: user.id,
        course,
        cohort,
        role,
        status,
        additional_data,
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: "Cohort member added successfully",
      data: member,
    });
  } catch (error) {
    await transaction.rollback();
    return next(error);
  }
};

// POST /cohort-members/bulk-upload
exports.bulkUploadCohortMembers = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "CSV file is required" });
  }

  const parsedRows = [];
  const errorRows = [];
  const successRows = [];

  // 1. Parse CSV fully first
  await new Promise((resolve, reject) => {
    Readable.from(req.file.buffer)
      .pipe(
        csv({
          separator: ",",
          mapHeaders: ({ header }) => header.trim(),
        })
      )
      .on("data", (row) => parsedRows.push(row))
      .on("end", resolve)
      .on("error", reject);
  });

  // 2. Process rows sequentially
  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];

    const transaction = await sequelize.transaction();

    try {
      const { name, email, phone, course, cohort, role, status } = row;

      if (!name || !email || !course || !cohort || !role || !status) {
        throw new Error("Missing required fields");
      }

      if (!validateEmail(email)) {
        throw new Error("Invalid email address");
      }

      const normalizedEmail = email.trim();

      // 1. Find or create user
      let user = await users.findOne({
        where: { email: normalizedEmail },
        transaction,
      });

      if (!user) {
        user = await users.create(
          {
            name: name.trim(),
            email: normalizedEmail,
            phone: phone?.trim() || "",
          },
          { transaction }
        );
      } else if (!user.phone && phone) {
        user.phone = phone.trim();
        await user.save({ transaction });
      }

      // 2. Check existing membership
      const existingMember = await CohortMember.findOne({
        where: {
          userId: user.id,
          course: course.trim(),
          cohort: cohort.trim(),
        },
        transaction,
      });

      if (existingMember) {
        throw new Error("User already exists in this cohort and course");
      }

      // 3. Create cohort member
      const member = await CohortMember.create(
        {
          userId: user.id,
          course: course.trim(),
          cohort: cohort.trim(),
          role: role.trim(),
          status: status.trim(),
        },
        { transaction }
      );

      await transaction.commit();

      successRows.push({
        rowNumber: i + 1,
        email: normalizedEmail,
        cohort,
        course,
        memberId: member.id,
      });
    } catch (err) {
      await transaction.rollback();

      errorRows.push({
        rowNumber: i + 1,
        row,
        error: err.message,
      });
    }
  }

  return res.status(201).json({
    success: true,
    message: "Bulk upload processed",
    summary: {
      total: parsedRows.length,
      success: successRows.length,
      failed: errorRows.length,
    },
    successRows,
    errorRows,
  });
};

// GET /cohort-members
exports.getAllCohortMembers = async (req, res, next) => {
  const { search, course, cohort } = req.query;
  const { page, limit, offset } = getPaginationParams(req.query);

  const where = {};
  if (course && course !== "all") where.course = course;
  if (cohort && cohort !== "all") where.cohort = cohort;

  const searchWhere = search
    ? {
      [Op.or]: [
        sequelize.where(sequelize.col("user.name"), {
          [Op.iLike]: `%${search}%`,
        }),
        sequelize.where(sequelize.col("user.email"), {
          [Op.iLike]: `%${search}%`,
        }),
        sequelize.where(sequelize.col("user.phone"), {
          [Op.iLike]: `%${search}%`,
        }),
      ],
    }
    : null;

  const { rows, count } = await CohortMember.findAndCountAll({
    where,
    include: [
      {
        model: users,
        as: "user",
        attributes: ["id", "name", "email", "phone"],
      },
    ],
    ...(search && { where: searchWhere }),
    limit,
    offset,
    order: [["createdAt", "DESC"]],
    distinct: true,
  });

  res.json({
    success: true,
    data: rows,
    meta: getMeta(count, page, limit),
  });
};

// GET /cohort-members/:id
exports.getCohortMemberById = async (req, res, next) => {
  const { id } = req.params;

  const member = await CohortMember.findOne({
    where: { id },
    include: [
      {
        model: users,
        as: "user",
        attributes: ["id", "name", "email", "phone"],
      },
    ],
  });

  if (!member) {
    return res.status(404).json({
      message: "Cohort member not found",
    });
  }

  return res.json({
    success: true,
    data: member,
  });
};

// PUT /cohort-members/:id
exports.updateCohortMember = async (req, res) => {
  const { id } = req.params;
  const { course, cohort, role, status, additional_data } = req.body;

  const member = await CohortMember.findOne({
    where: { id },
    include: [
      {
        model: users,
        as: "user",
        attributes: ["id", "name", "email"],
      },
    ],
  });

  if (!member) {
    return res.status(404).json({
      message: "Cohort member not found",
    });
  }

  // check conflict
  const finalCourse = course ?? member.course;
  const finalCohort = cohort ?? member.cohort;

  const conflict = await CohortMember.findOne({
    where: {
      userId: member.userId,
      course: finalCourse,
      cohort: finalCohort,
      id: { [Op.ne]: member.id },
    },
  });

  if (conflict) {
    return res.status(409).json({
      message: "User already exists in this course and cohort",
    });
  }

  // Safe update
  await member.update({
    ...(course !== undefined && { course }),
    ...(cohort !== undefined && { cohort }),
    ...(role !== undefined && { role }),
    ...(status !== undefined && { status }),
    ...(additional_data !== undefined && { additional_data }),
  });

  return res.json({
    success: true,
    message: "Cohort member updated successfully",
    data: member,
  });
};

// DELETE /cohort-members/:id
exports.deleteCohortMember = async (req, res) => {
  const { id } = req.params;

  const member = await CohortMember.findByPk(id);

  if (!member) {
    return res.status(404).json({
      message: "Cohort member not found",
    });
  }

  await member.destroy();

  return res.json({
    success: true,
    message: "Cohort member deleted successfully",
  });
};
