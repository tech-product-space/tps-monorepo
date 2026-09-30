module.exports = (sequelize, DataTypes) => {
  const blogs = sequelize.define("blogs", {
    blog_id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    author: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    publishedDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    content: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    metaTitle: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "",
    },
    metaDesc: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "",
    },
    readTime: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    thumbnailSrc: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "",
    },
    thumbnailAlt: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "",
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'draft',
    },
    // 'blog' = listed at /blogs, 'standalone' = served at root /<slug> ("Landing Blogs")
    placement: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'blog',
    },
    // Array of { question, answer } rendered as an accordion on the blog page
    faqs: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },
    featured: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // 1 = legacy block editor (v1), 2 = Tiptap rich editor (v2).
    // For v2, the `content` JSON column holds an object:
    // { doc, tableOfContents, subTitle, tags, authorDetails } instead of a block array.
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    recommended: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    scheduledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  }, {
    tableName: "blogs",
  });

  return blogs;
};
