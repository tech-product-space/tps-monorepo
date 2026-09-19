'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('PersonalInfos', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        unique: true,
      },
      name: Sequelize.STRING,
      email: Sequelize.STRING,
      mobile: Sequelize.STRING,
      company: Sequelize.STRING,
      gender: Sequelize.STRING,
      linkedin: Sequelize.STRING,
      resumeUrl: Sequelize.STRING,
      best_describe_you: Sequelize.STRING,
      best_describe_your_role: Sequelize.STRING,
      designation: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('PersonalInfos');
  },
};
