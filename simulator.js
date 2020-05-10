/*
 * Copyright © 2020. Viacheslav V Bogdanov
 * viacheslav.v.bogdanov@gmail.com
 * 
 *
 */

"use strict";

const depositAddresses = {}

/**
 * Wraps initialized ccxt exchange with simulated trading methods
 *
 * @param e initialized ccxt exchange
 * @param balances object of all balances
 */
module.exports = function (e, balances) {
    let simulation = true

    if (!balances[e.name]) balances[e.name] = {'info':'Simulated balance', 'free':{}, 'used':{}, 'total':{}}

    const balance = balances[e.name]

    const _fetchBalance = e.fetchBalance
    const _createOrder = e.createOrder
    // const _fetchOrder = e.fetchOrder
    // const _fetchOrders = e.fetchOrders
    // const _fetchOpenOrders = e.fetchOpenOrders
    // const _fetchClosedOrders = e.fetchClosedOrders
    // const _fetchMyTrades = e.fetchMyTrades
    const _deposit = e.deposit
    const _withdraw = e.withdraw

    function fetchBalance() {
        if (!simulation)
            return _fetchBalance()
        else
            return balance
    }


    // e.isSimulation = () => simulate
    // e.setSimulate = (enableSimulation) => simulate = enableSimulation
    e.__defineGetter__('$simulation', () => simulation)
    e.__defineSetter__('$simulation', (simulate) => simulation = simulate )

    e.fetchBalance = fetchBalance

    return e
}