const fs = require('fs');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { ContactList, ContactDetail, sequelize } = require("../../models");

const BATCH_SIZE = 2000;
const { fn, col } = require('sequelize');

exports.uploadContacts = async (req, res) => {
  const errors = [];
  let successCount = 0;
  let totalProcessed = 0;

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'CSV file is required' });
    }

    const { name: listName, contactListId } = req.body;

    let contactList;

    if (contactListId) {
      // Appending to existing list
      contactList = await ContactList.findByPk(contactListId);
      if (!contactList) {
        return res.status(404).json({ message: 'Contact list not found' });
      }
    } else {
      // Creating new list
      if (!listName) {
        return res.status(400).json({ message: 'Contact list name is required' });
      }

      const transaction = await sequelize.transaction();
      try {
        contactList = await ContactList.create({ name: listName }, { transaction });
        await transaction.commit();
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    }

    const batch = [];
    const uniqueSet = new Set();

    const stream = Readable.from(req.file.buffer).pipe(csv());

    let rowNumber = 0;

    for await (const row of stream) {
      rowNumber++;
      totalProcessed++;

      try {
        let { name, email, phone } = row;

        email = email ? email.trim().toLowerCase() : null;
        phone = phone ? phone.trim() : null;
        name = name ? name.trim() : null;

        if (!name) {
          throw new Error('Name is required');
        }

        let key;
        if (email) key = `email-${email}`;
        else if (phone) key = `phone-${phone}`;
        else key = `name-${name.toLowerCase()}`;

        if (uniqueSet.has(key)) continue;
        uniqueSet.add(key);

        batch.push({
          contactListId: contactList.id,
          name,
          email,
          phone,
        });

        if (batch.length >= BATCH_SIZE) {
          const inserted = await ContactDetail.bulkCreate(batch, {
            ignoreDuplicates: true,
          });
          successCount += inserted.length;
          batch.length = 0;
        }

      } catch (err) {
        errors.push({ rowNumber, row, error: err.message });
      }
    }

    if (batch.length > 0) {
      const inserted = await ContactDetail.bulkCreate(batch, {
        ignoreDuplicates: true,
      });
      successCount += inserted.length;
    }

    return res.status(201).json({
      success: true,
      message: 'Contacts uploaded successfully',
      contactListId: contactList.id,
      summary: {
        totalProcessed,
        success: successCount,
        failed: errors.length,
      },
      errors,
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Upload failed',
      error: error.message,
    });
  }
};


exports.getContactLists = async (req, res) => {
  try {
    const lists = await ContactList.findAll({
      attributes: [
        'id',
        'name',
        'isActive',
        'createdAt',
        [fn('COUNT', col('contacts.id')), 'contactCount'],
      ],
      include: [
        {
          model: ContactDetail,
          as: 'contacts',
          attributes: [],
        },
      ],
      group: ['ContactList.id'],
      order: [['createdAt', 'DESC']],
    });

    res.json(lists);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.getContactsByListId = async (req, res) => {
  try {
    const { id } = req.params;

    const contacts = await ContactDetail.findAll({
      where: { contactListId: id },
      attributes: ['id', 'name', 'email', 'phone'],
      order: [['createdAt', 'DESC']],
    });

    res.json({
      total: contacts.length,
      contacts,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};