const { Lead, User, sequelize } = require('./src/models');
const { Op } = require('sequelize');

async function verifyMultiHierarchy() {
  console.log('--- STARTING MULTI-HIERARCHY SCALING TEST ---');
  
  try {
    // 1. Setup Hierarchy
    // Manager 1 -> Agent 1
    // Manager 2 -> Agent 2
    const m1Id = 'm1111111-1111-1111-1111-111111111111';
    const a1Id = 'a1111111-1111-1111-1111-111111111111';
    const m2Id = 'm2222222-2222-2222-2222-222222222222';
    const a2Id = 'a2222222-2222-2222-2222-222222222222';

    await User.bulkCreate([
      { id: m1Id, name: 'Manager 1', email: 'm1@test.com', password_hash: 'h', role: 'Manager' },
      { id: a1Id, name: 'Agent 1', email: 'a1@test.com', password_hash: 'h', role: 'Agent', manager_id: m1Id },
      { id: m2Id, name: 'Manager 2', email: 'm2@test.com', password_hash: 'h', role: 'Manager' },
      { id: a2Id, name: 'Agent 2', email: 'a2@test.com', password_hash: 'h', role: 'Agent', manager_id: m2Id }
    ], { ignoreDuplicates: true });

    // 2. Setup Leads
    const poolLead = '00000000-0000-0000-0000-000000000000';
    const a1Lead = '11111111-1111-1111-1111-111111111111';
    const a2Lead = '22222222-2222-2222-2222-222222222222';

    await Lead.bulkCreate([
      { id: poolLead, name: 'Pool Lead', phone: '0', status_id: 's_new', agent_id: null },
      { id: a1Lead, name: 'A1 Lead', phone: '1', status_id: 's_new', agent_id: a1Id },
      { id: a2Lead, name: 'A2 Lead', phone: '2', status_id: 's_new', agent_id: a2Id }
    ], { ignoreDuplicates: true });

    console.log('✅ Mock data created.');

    // 3. Test Manager 1 Visibility
    const m1Subordinates = await User.findAll({ where: { manager_id: m1Id }, attributes: ['id'] });
    const m1TeamIds = [m1Id.toLowerCase(), ...m1Subordinates.map(s => s.id.toLowerCase())];
    
    const m1View = await Lead.findAll({
      where: {
        is_deleted: false,
        agent_id: { [Op.or]: [ { [Op.in]: m1TeamIds }, { [Op.eq]: null } ] }
      }
    });

    const m1VisibleIds = m1View.map(l => l.id);
    console.log(`👁️ Manager 1 sees: ${m1VisibleIds.length} leads.`);
    
    const hasA1Lead = m1VisibleIds.includes(a1Lead);
    const hasPoolLead = m1VisibleIds.includes(poolLead);
    const hasA2Lead = m1VisibleIds.includes(a2Lead);

    console.log(`- Sees own team (A1)? ${hasA1Lead ? '✅' : '❌'}`);
    console.log(`- Sees Pool? ${hasPoolLead ? '✅' : '❌'}`);
    console.log(`- Sees other team (A2)? ${hasA2Lead ? '❌ (Correct)' : '✅ (BUG)'}`);

    if (hasA1Lead && hasPoolLead && !hasA2Lead) {
      console.log('🚀 SUCCESS: Multi-manager logic is scaled and secure!');
    } else {
      console.error('❌ FAILURE: Visibility leakage detected.');
      process.exit(1);
    }

    // Cleanup
    await Lead.destroy({ where: { id: [poolLead, a1Lead, a2Lead] } });
    await User.destroy({ where: { id: [m1Id, a1Id, m2Id, a2Id] } });
    process.exit(0);

  } catch (error) {
    console.error('Scaling Test Error:', error);
    process.exit(1);
  }
}

verifyMultiHierarchy();
