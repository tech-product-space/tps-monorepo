'use strict';

/**
 * Proof-of-payment files attached to a manually-recorded payment (optional).
 *
 * Only the S3 object KEY is stored — never a URL. The objects live under a
 * private prefix and are read through short-lived presigned URLs, because a
 * payment screenshot carries the customer's bank details and must never be
 * anonymously reachable. Building the URL at read time also means the storage
 * host can change without a data migration.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payment_attachments', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      payment_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'payments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      // S3 object key, e.g. crm/payment-proofs/<paymentId>/<ulid>-shot.png
      file_key: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      // Original filename, kept for display and for the download filename.
      file_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      mime_type: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      size_bytes: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      uploaded_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('payment_attachments', {
      name: 'payment_attachments_payment_id_idx',
      fields: ['payment_id'],
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payment_attachments');
  },
};
