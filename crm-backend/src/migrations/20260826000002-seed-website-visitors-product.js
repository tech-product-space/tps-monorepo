'use strict';

/**
 * The Website Visitors product and its subsources.
 *
 * Seeded rather than created by hand so every environment has the same ids —
 * TPS sends `product_id: 'Website Visitors'` and a subsource label, and both have
 * to resolve on beta and live alike.
 *
 * intent_tier is 'Low' deliberately. resolveProduct copies it onto a brand-new
 * person's `intent`, and someone browsing is not evidence of high intent on its
 * own — the pages they open are, and that is a later decision, not this one.
 *
 * assigned_manager_id is left NULL. It only applies to visitors who are not
 * already in the CRM; anyone we know keeps their existing owner. Set it from
 * Settings once you have decided who should pick up brand-new website visitors —
 * until then they arrive unassigned, which is visible rather than silently wrong.
 *
 * Subsource ids are prefixed `wv_` because subsource ids are a single global
 * namespace: an unprefixed 'PM Fellowship' would collide the moment another
 * product wants a subsource of the same name.
 */

const PRODUCT_ID = 'Website Visitors';

const SUBSOURCES = [
  { id: 'wv_pm_fellowship', label: 'PM Fellowship' },
  { id: 'wv_gen_ai', label: 'Gen AI Program' },
  { id: 'wv_ai_builders', label: 'AI Builders 101' },
  { id: 'wv_ai_product_leaders', label: 'AI for Product Leaders' },
  { id: 'wv_events', label: 'Events' },
  { id: 'wv_resources', label: 'Resources' },
  { id: 'wv_blogs', label: 'Blogs' },
  { id: 'wv_free_courses', label: 'Free Courses' },
  { id: 'wv_others', label: 'Others' },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // ignoreDuplicates so re-running against an environment where someone already
    // made the product by hand is a no-op rather than a crash.
    await queryInterface.bulkInsert(
      'products',
      [
        {
          id: PRODUCT_ID,
          label: 'Website Visitors',
          assigned_manager_id: null,
          intent_tier: 'Low',
          is_active: true,
          // Last in the tab strip — it is a watchlist, not a pipeline, and should
          // not push the real products along.
          sort_order: 99,
          created_at: now,
          updated_at: now,
        },
      ],
      { ignoreDuplicates: true },
    );

    await queryInterface.bulkInsert(
      'subsources',
      SUBSOURCES.map((s, i) => ({
        id: s.id,
        label: s.label,
        product_id: PRODUCT_ID,
        is_active: true,
        sort_order: i,
        created_at: now,
        updated_at: now,
      })),
      { ignoreDuplicates: true },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('subsources', { product_id: PRODUCT_ID }, {});
    await queryInterface.bulkDelete('products', { id: PRODUCT_ID }, {});
  },
};
