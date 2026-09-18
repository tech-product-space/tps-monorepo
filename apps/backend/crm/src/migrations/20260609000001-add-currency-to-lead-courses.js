'use strict';

/**
 * International payments — lead_courses currency + DECIMAL money columns.
 *
 *  - `currency`: the currency this enrollment is priced in (default INR). Every
 *    payment on the enrollment inherits it.
 *  - Money columns → DECIMAL(14,3): supports 2-dp (USD cents) and 3-dp (KWD)
 *    currencies. Existing whole-number INR rows stay valid (no value change).
 *    `platform_discount_percent` stays INTEGER (it's a percent, not money).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('lead_courses', 'currency', {
      type: Sequelize.STRING(10),
      allowNull: false,
      defaultValue: 'INR',
    });

    const MONEY = { type: Sequelize.DECIMAL(14, 3), allowNull: false };
    await queryInterface.changeColumn('lead_courses', 'course_price', { ...MONEY });
    await queryInterface.changeColumn('lead_courses', 'gst_amount', { ...MONEY, defaultValue: 0 });
    await queryInterface.changeColumn('lead_courses', 'agent_discount_amount', { ...MONEY, defaultValue: 0 });
    await queryInterface.changeColumn('lead_courses', 'final_fee', { ...MONEY });
  },

  async down(queryInterface, Sequelize) {
    const INT = { type: Sequelize.INTEGER, allowNull: false };
    await queryInterface.changeColumn('lead_courses', 'course_price', { ...INT });
    await queryInterface.changeColumn('lead_courses', 'gst_amount', { ...INT, defaultValue: 0 });
    await queryInterface.changeColumn('lead_courses', 'agent_discount_amount', { ...INT, defaultValue: 0 });
    await queryInterface.changeColumn('lead_courses', 'final_fee', { ...INT });
    await queryInterface.removeColumn('lead_courses', 'currency');
  },
};
