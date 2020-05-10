/*
 * Copyright © 2020. Viacheslav V Bogdanov
 * viacheslav.v.bogdanov@gmail.com
 * 
 *
 */

"use strict";

/**
 * Wraps initialized ccxt exchange with simulated trading methods
 *
 * @param e initialized ccxt exchange
 */
module.exports = function (e) {
    let simulate = true

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
        if (!simulate) return e.fetchBalance()
        


    }

    e.isSimulation = () => simulate
    e.setSimulate = (enableSimulation) => simulate = enableSimulation

    e.fetchBalance = fetchBalance



}