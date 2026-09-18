'use strict';
module.exports = (sequelize, DataTypes) => {
  const ProgramOffer = sequelize.define('ProgramOffer', {
    program_name: DataTypes.STRING,
    offer_valid_for: DataTypes.TEXT,
    price: DataTypes.INTEGER,
    discount: DataTypes.INTEGER,
    cohort_seats: DataTypes.INTEGER,
    start_date: DataTypes.DATE,
    duration: DataTypes.STRING,
    offer_valid_till: DataTypes.DATE,
    brochure_link: DataTypes.STRING,
    usd_price: DataTypes.INTEGER,
    usd_discount: DataTypes.INTEGER,
    emi_amount: DataTypes.STRING,
    usd_emi_amount: DataTypes.STRING,
    tax_inclusive: DataTypes.BOOLEAN,
    usd_tax_inclusive: DataTypes.BOOLEAN,
    enrollmentEmail: DataTypes.JSONB,
    downloadCurriculum: DataTypes.JSONB
  }, {});
  return ProgramOffer;
};
