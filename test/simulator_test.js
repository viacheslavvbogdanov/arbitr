const assert = require('assert');
const Simulator = require('../simulator.js');


describe('Simulator', () => {
    const balances = {}
    const e  = {name:'EXCHANGE1'} // new ccxt exchange
    const e2 = {name:'EXCHANGE2'} // new ccxt exchange
    const interfaces = {
        assert: assert
    }
    const s  = Simulator(e, balances,  interfaces)
    const s2 = Simulator(e2, balances, interfaces)
    const TST = 'TST' // test currency code
    const STS = 'STS' // test currency code 2
    const symbol = STS+'/'+TST

    before(async () => {

        // console.log(balance)
    });

    describe('$simulation prop', () => {
        it('should be true by default', () => {
            assert.strictEqual(s.$simulation, true);
        });

    });

    describe('balance',  () => {


        it('info should be \'Simulated\'', async () => {
            const balance = await s.fetchBalance()
            assert.strictEqual(balance.info.simulated, true);
        });

        it('$setSimulatedBalance 100. balance should be 100', async () => {
            s.$setSimulatedBalance(TST, 100.0)
            const balance = await s.fetchBalance()
            assert.strictEqual(balance[TST].total, 100.0);
        });

        it('withdraw 20. balance should be 80', async () => {
            const adr = await s2.createDepositAddress(TST)
            await s.withdraw(TST, 20.0, adr.address, adr.tag)
            const balance = await s.fetchBalance()
            assert.strictEqual(balance[TST].total, 80.0);
        });

        it('balance 2 should be 20', async () => {
            const balance = await s2.fetchBalance()
            assert.strictEqual(balance[TST].total, 20.0);
        });

        it('withdraw back 10. balance should be 90', async () => {
            const adr = await s.fetchDepositAddress(TST)
            await s2.withdraw(TST, 10.0, adr.address, adr.tag)
            const balance = await s.fetchBalance()
            assert.strictEqual(balance[TST].total, 90.0);
        });

        it('balance 2 should be 10', async () => {
            const balance = await s2.fetchBalance()
            assert.strictEqual(balance[TST].total, 10.0);
        });

        it('buy 5 STS for 10 TST each. STS balance should be 5', async () => {
            const order = await s.createOrder(symbol, 'market', 'buy', 5.0, 10.0)
            const balance = await s.fetchBalance()
            assert.strictEqual(balance[STS].total, 5.0);
        });

        it('TST balance should be 40', async () => {
            const balance = await s.fetchBalance()
            assert.strictEqual(balance[TST].total, 40.0);
        });

        it('withdraw 5 STS. balance should be 0', async () => {
            const adr = await s2.createDepositAddress(STS)
            await s.withdraw(STS, 5.0, adr.address, adr.tag)
            const balance = await s.fetchBalance()
            assert.strictEqual(balance[STS].total, 0.0);
        });

        it('STS balance 2 should be 5', async () => {
            const balance = await s2.fetchBalance()
            assert.strictEqual(balance[STS].total, 5.0);
        });

        it('sell 5 STS for 20 TST each. STS balance should be 110 (10+100)', async () => {
            const order = await s2.createOrder(symbol, 'market', 'sell', 5.0, 20.0)
            const balance = await s2.fetchBalance()
            assert.strictEqual(balance[TST].total, 110.0);
        });

        it('withdraw 110 TST. balance 2 should be 0', async () => {
            const adr = await s.createDepositAddress(TST)
            await s2.withdraw(TST, 110.0, adr.address, adr.tag)
            const balance = await s2.fetchBalance()
            assert.strictEqual(balance[TST].total, 0.0);
        });

        it('TST balance should be 150', async () => {
            const balance = await s.fetchBalance()
            assert.strictEqual(balance[TST].total, 150.0);
        });


    });
});