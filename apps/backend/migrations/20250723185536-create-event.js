'use strict';
/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create Events table
    await queryInterface.createTable('Events', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      eventTitle: {
        type: Sequelize.STRING,
      },
      eventSubtitle: {
        type: Sequelize.STRING,
      },
      eventStartDate: {
        type: Sequelize.STRING,
      },
      eventEndDate: {
        type: Sequelize.STRING,
      },
      eventStartTime: {
        type: Sequelize.STRING,
      },
      eventEndTime: {
        type: Sequelize.STRING,
      },
      eventType: {
        type: Sequelize.ENUM('Teardown', 'Hackathon', 'Workshop'),
        allowNull: false,
      },
      speakers: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
      },
      numberOfAttendees: {
        type: Sequelize.INTEGER,
      },
      ctaType: {
        type: Sequelize.ENUM('Join Waitlist', 'Register Now'),
        allowNull: false,
      },
      eventCreativeUrl: {
        type: Sequelize.STRING,
      },
      isPublished: {
        type: Sequelize.BOOLEAN,
      },
      locationType: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      location: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      eventDetails: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    // 2. Create EventGuests table
    await queryInterface.createTable('EventGuests', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      linkedin: {
        type: Sequelize.STRING,
      },
      name: {
        type: Sequelize.STRING,
      },
      phone: {
        type: Sequelize.STRING,
      },
      referralCode: {
        type: Sequelize.STRING,
      },
      role: {
        type: Sequelize.STRING,
      },
      userType: {
        type: Sequelize.STRING,
      },
      eventType: {
        type: Sequelize.STRING,
      },
      eventName: {
        type: Sequelize.STRING,
      },
      guestType: {
        type: Sequelize.STRING,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      eventId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Events',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    // Drop EventGuests first due to foreign key dependency
    await queryInterface.dropTable('EventGuests');
    await queryInterface.dropTable('Events');

    // Drop ENUM types used in Events table
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Events_eventType";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Events_ctaType";');
  },
};
