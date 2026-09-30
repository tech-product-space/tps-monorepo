'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('ProgramOffers', 'usd_price', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn('ProgramOffers', 'usd_discount', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn('ProgramOffers', 'emi_amount', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('ProgramOffers', 'usd_emi_amount', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('ProgramOffers', 'tax_inclusive', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    await queryInterface.addColumn('ProgramOffers', 'usd_tax_inclusive', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    // Seed the EMI amount with the value the pages hardcoded until now (the
    // currency symbol is added per card by the frontend), so an admin saving
    // the offer form doesn't blank it by accident.
    await queryInterface.sequelize.query(
      "UPDATE \"ProgramOffers\" SET emi_amount = '1,295/month' WHERE emi_amount IS NULL"
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('ProgramOffers', 'usd_price');
    await queryInterface.removeColumn('ProgramOffers', 'usd_discount');
    await queryInterface.removeColumn('ProgramOffers', 'emi_amount');
    await queryInterface.removeColumn('ProgramOffers', 'usd_emi_amount');
    await queryInterface.removeColumn('ProgramOffers', 'tax_inclusive');
    await queryInterface.removeColumn('ProgramOffers', 'usd_tax_inclusive');
  }
};
