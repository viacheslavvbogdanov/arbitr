const assert = require('assert');
const Simulator = require('../simulator.js');


describe('Simulator', () => {
    const balances = {}
    const e1 = {} // new ccxt exchange
    const s = Simulator(e1, balances)

    beforeEach(function() {
    });

    describe('$simulation prop', () => {
        it('should be true by default', () => {
            assert.strictEqual(s.$simulation, true);
        });
        it('should be false after set to false', () => {
            s.$simulation = false
            assert.strictEqual(s.$simulation, false);
        });
        it('should be true after set to true', () => {
            s.$simulation = true
            assert.strictEqual(s.$simulation, true);
        });

    });

    describe('balance', () => {
        const balance = s.fetchBalance()
        it('info should be \'Simulated balance\'', () => {
            assert.strictEqual(balance.info, 'Simulated balance');
        });


    });
});