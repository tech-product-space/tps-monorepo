export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn("Resources", "resourceContent", {
    type: Sequelize.JSONB,
    allowNull: true,
    defaultValue: {},
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("Resources", "resourceContent");
}