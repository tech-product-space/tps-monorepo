'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('CertificateTemplates', 'emailSubject', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('CertificateTemplates', 'emailBody', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('CertificateTemplates', 'emailSubject');
    await queryInterface.removeColumn('CertificateTemplates', 'emailBody');
  }
};
