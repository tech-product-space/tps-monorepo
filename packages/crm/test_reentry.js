const { Lead, Product, sequelize } = require('./src/models');
const leadService = require('./src/services/lead.service');

async function verify() {
  await sequelize.sync();
  
  const testPhone = '9999999999';
  const testData = {
    name: 'Verification User',
    phone: testPhone,
    email: 'verify@example.com',
    product_id: 'PM Fellowship',
    source: 'Test'
  };

  try {
    // 1. Clear any existing test lead
    await Lead.destroy({ where: { phone: testPhone } });

    // 2. Create lead first time
    console.log('--- Initial Creation ---');
    const res1 = await leadService.createOrProcessReentry(testData, null);
    const lead1 = res1.lead;
    const initialDate = new Date(lead1.lead_date).getTime();
    console.log('Initial Lead Date:', lead1.lead_date);

    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. Re-entry (duplicate)
    console.log('\n--- Re-entry (Duplicate) ---');
    const res2 = await leadService.createOrProcessReentry(testData, null);
    const lead2 = res2.lead;
    const reentryId = lead2.id;
    const reentryDate = new Date(lead2.lead_date).getTime();
    
    console.log('Re-entry Lead Date:', lead2.lead_date);
    console.log('Is ID SAME?', lead1.id === lead2.id);
    
    if (reentryDate > initialDate) {
      console.log('\n✅ SUCCESS: lead_date was updated on re-entry.');
    } else {
      console.log('\n❌ FAILURE: lead_date was NOT updated on re-entry.');
      process.exit(1);
    }

    if (lead2.status_id === 's_reentry') {
        console.log('✅ SUCCESS: Status changed to s_reentry.');
    }

    // Cleanup
    await Lead.destroy({ where: { id: reentryId } });
    process.exit(0);

  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  }
}

verify();
