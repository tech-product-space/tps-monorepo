'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_profiles', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },

      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users', // make sure this matches the actual table name
          key: 'id',
        },
        onDelete: 'CASCADE',
      },

      name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false },
      mobile: { type: Sequelize.STRING, allowNull: false },
      query: { type: Sequelize.TEXT, allowNull: true },
      company: { type: Sequelize.STRING, allowNull: true },
      current_role: { type: Sequelize.STRING, allowNull: true },
      linkedin: { type: Sequelize.STRING, allowNull: true },
      target_domain: { type: Sequelize.STRING, allowNull: true },
      question_type: { type: Sequelize.STRING, allowNull: true },
      date: { type: Sequelize.DATEONLY, allowNull: true },
      time: { type: Sequelize.STRING, allowNull: true },
      referral_code: { type: Sequelize.STRING, allowNull: true },
      best_describe_you: { type: Sequelize.STRING, allowNull: true },
      best_describe_your_role: { type: Sequelize.STRING, allowNull: true },
      designation: { type: Sequelize.STRING, allowNull: true },

      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('user_profiles');
  }
};
