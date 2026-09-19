module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addConstraint('user_fitment_scores', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'fk_fitment_userId',
      references: {
        table: 'users',
        field: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeConstraint('user_fitment_scores', 'fk_fitment_userId');
  },
};
