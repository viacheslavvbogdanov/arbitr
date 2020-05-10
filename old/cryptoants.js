/*
 * Copyright (c) 2018. Viacheslav V Bogdanov
 * viacheslav.v.bogdanov@gmail.com
 */

const _     = require('underscore')
const log   = require ('ololog').configure ({ locate: false })
require ('ansicolor').nice
const _tab="\t"

function colR( val, width=10) {
    let text = val.toString()
    let spaces = width-text.length
    while (spaces<=0) spaces+=width
    return Array(spaces).join(' ') + text
}
function colL( val, width=10) {
    let text = val.toString()
    let spaces = width-text.length
    while (spaces<=0) spaces+=width
    return text + Array(spaces).join(' ')
}

function formatLoop(loop){
    return loop.map( (symbol) => {
        let spaces = 5-symbol.length
        if (spaces<=0) spaces = 1
        return symbol + Array(spaces).join(' ')
    }).join(' → ')
}

function aggregateTickers(exchangesReceived, exchangesTickers){
    // Aggregate ticks
    let ticks = {}
    // log('Aggregate')
    _.each( exchangesReceived, (exchangeName) => {
        const tickers = exchangesTickers[exchangeName]
        // log( exchangeName.blue, propsCount(tickers) )
        _.map( tickers, function( num, pair ) {
            // console.log( num, pair );
            let v = ticks[pair]
            if (!v) v = {}
            let a = tickers[pair]
            a['exchange'] = exchangeName
            a['pair'] = pair
            v[exchangeName] = tickers[pair]
            ticks[pair] =  v
            return ticks[pair]
        })
    })
    // console.log( 'Aggregated', ticks );
    // console.log( 'BTC/USD', ticks['BTC/USD'] );
    return ticks
}


// function printDirections(directions){
//     _.each( directions, (tick) => {
//         log(
//             colR(tick.difLast.toFixed(2)+'%'),
//             colR(tick.difBidAsk.toFixed(2)+'%'),
//             colR(tick.difdif.toFixed(0)+'%',5),
//             colR(tick.pair.blue),
//             colR(tick.minQuoteVolume.toFixed(0)), _tab,
//             tick.exBuyName, '->', tick.exSellName,
//             tick.exBuyWithdraw, tick.exSellDeposit
//         )
//     })
// }

function printLoops(loops) {
    if (loops.length>0) {
        log('=== loops ==='.blue)
        _.each(loops, (loop) => {
            log(loop.length-1, loop.join(' → '))
        })
    } else {
        log('=== no loops ==='.yellow)
    }
}

function createGraph(markets) {
    let graph = {}
    _.each( markets, (market) => {
        // log( market, market.base, market.quote)
        if (!graph[market.base]) graph[market.base] = []
        graph[market.base].push(market.quote)
        if (!graph[market.quote]) graph[market.quote] = []
        graph[market.quote].push(market.base)
    })
    // log( 'Graph', graph)
    // Remove dead-ends
    _.each( graph, (node, name) => {
        // log( 'node', name, node, node.length )
        if (node.length===1) {
            const backPath = node[0]
            delete graph[name]
            if (graph[backPath])
                graph[backPath].splice(graph[backPath].indexOf(name), 1)
        }
    })
    // log('Filtered')
    // _.each( graph, (node, name) => {
    //     log( 'node', name, node, node.length )
    // })
    return graph
}

function findLoops(graph, maxLength=3) {
    // console.time("findLoops");
    let allLoops = []
    // log( 'findLoops'.blue, graph)
    function findLoopsFromSymbol(graph, symbol, path=[] ) {
        if (path.length>maxLength) return null// drop long routes
        if (path[0]===symbol) return path.length>2 ? [path.concat(symbol)]:null  // loop found
        if (path.indexOf(symbol)>0) return null// drop already walked route

        path = path.slice(0) // copy path array
        path.push(symbol)
        let loops = []

        // log( 'findLoopsFromSymbol', startSymbol, symbol, path)
        const nextSymbols = graph[symbol]

        // log( 'NextSymbols['.blue, symbol, ']'.blue, nextSymbols)
        _.each( nextSymbols, (nextSymbol) => {
            // log( path, '  ', symbol,' -> ', nextSymbol )
            const foundLoops = findLoopsFromSymbol( graph, nextSymbol, path)
            if (foundLoops) loops = loops.concat(foundLoops)
        })
        return loops
    }
    _.each( graph, (node, symbol) => {
        // log('each'.blue, symbol, node)
        const foundLoops = findLoopsFromSymbol(graph, symbol)
        if (foundLoops) allLoops = allLoops.concat(foundLoops) //
    })
    // crypton.printLoops(allLoops)
    // console.timeEnd("findLoops");

    return allLoops
}


function findChains(exchangeName, markets, loops, tickers) {
    // const loops = findLoops(graph)
    // log('findChains tickers'.blue, tickers)
    let chains = []
    _.each( loops, (loop) => {
        // log('loop', loop)
        const initialValue = 0.1
        let value = initialValue
        const steps = []
        let chainBroken = false
        loop.forEach( (symbol, i, arr) => {
            // log('symbol', symbol)
            if (arr.length>i+1) {
                const base = symbol
                const quote = arr[i + 1]
                let sell = {}
                let buy  = {}
                sell.pair = base + '/' + quote
                buy.pair = quote + '/' + base

                sell.market = markets[sell.pair]
                buy.market = markets[buy.pair]
                sell.ticker = tickers[sell.pair]
                buy.ticker = tickers[buy.pair]
                let pair=null
                let isSell=null
                let fee=null
                let ticker = null
                let exchangeRate = null
                let market = null

                if (sell.market && sell.ticker) {
                    pair = sell.pair
                    isSell = true
                    market = sell.market
                    // delete market['info']
                    fee = sell.market.taker
                    ticker = sell.ticker
                    // exchangeRate = ticker.ask
                    exchangeRate = ticker.bid

                } else if (buy.market && buy.ticker){
                    pair = buy.pair
                    isSell = false
                    market = buy.market
                    // delete market['info']
                    fee = buy.market.taker
                    ticker = buy.ticker
                    // exchangeRate = 1/ticker.bid
                    exchangeRate = 1/ticker.ask
                } else {
                    // log('NOT FOUND MARKET or TICKER'.red, sell.pair, buy.pair)
                    // log(_tab, 'MARKET'.blue, sell.market?'denf':'undef'.red, buy.market?'denf':'undef'.red)
                    // log(_tab, 'TICKER'.green, sell.ticker?'denf':'undef'.red, buy.ticker?'denf':'undef'.red)
                    // log(markets)
                    chainBroken = true
                }

                // log( pair.blue, sell, ticker )
                value = (value * exchangeRate)*(1.0-fee)
                let quoteVolume = 0
                let baseVolume = 0
                if (ticker && ticker.quoteVolume) quoteVolume = ticker.quoteVolume
                if (ticker && ticker.baseVolume) baseVolume = ticker.baseVolume
                if (ticker) steps.push( {
                    pair:pair
                    ,isSell:isSell
                    ,fee:fee
                    ,rate:exchangeRate
                    ,quoteVolume:quoteVolume
                    ,baseVolume:baseVolume
                    ,ticker:ticker
                    ,market:market
                    ,value:value
                })
            }
        } )
        const profit = value / initialValue - 1
        const minQuoteVolume = _.min(steps, 'quoteVolume').quoteVolume
        const minBaseVolume = _.min(steps, 'baseVolume').baseVolume
        if (!chainBroken && isFinite(profit) && isFinite(minQuoteVolume)) {
            const stepsCount = loop.length-1
            const chainData = {
                exchange:exchangeName,
                profit:profit,
                steps:steps,
                stepsCount:stepsCount,
                stepProfit:(profit/stepsCount),
                loop:formatLoop(loop),
                startSymbol:loop[0],
                exchangeLoop:exchangeName+': '+loop.join(' → '),
                minQuoteVolume:minQuoteVolume,
                minBaseVolume:minBaseVolume,
                minVolume:Math.min(minBaseVolume,minQuoteVolume)
            }
            chains.push(chainData)
        }
    })
    return _.sortBy(chains, 'minVolume' )
}

// function findChains(exchangeName, markets, loops, tickers) {
//     // const loops = findLoops(graph)
//     // log('findChains tickers'.blue, tickers)
//     let chains = []
//     _.each( loops, (loop) => {
//         // log('loop', loop)
//         const initialValue = 0.1
//         let value = initialValue
//         const steps = []
//         let chainBroken = false
//         loop.forEach( (symbol, i, arr) => {
//             // log('symbol', symbol)
//             if (arr.length>i+1) {
//                 const base = symbol
//                 const quote = arr[i + 1]
//                 let sell = {}
//                 let buy  = {}
//                 sell.pair = base + '/' + quote
//                 buy.pair = quote + '/' + base
//
//                 sell.market = markets[sell.pair]
//                 buy.market = markets[buy.pair]
//                 sell.ticker = tickers[sell.pair]
//                 buy.ticker = tickers[buy.pair]
//                 let pair=null
//                 let isSell=null
//                 let fee=null
//                 let ticker = null
//                 let exchangeRate = null
//                 let market = null
//
//                 if (sell.market && sell.ticker) {
//                     pair = sell.pair
//                     isSell = true
//                     market = sell.market
//                     // delete market['info']
//                     fee = sell.market.taker
//                     ticker = sell.ticker
//                     // exchangeRate = ticker.ask
//                     exchangeRate = ticker.bid
//
//                 } else if (buy.market && buy.ticker){
//                     pair = buy.pair
//                     isSell = false
//                     market = buy.market
//                     // delete market['info']
//                     fee = buy.market.taker
//                     ticker = buy.ticker
//                     // exchangeRate = 1/ticker.bid
//                     exchangeRate = 1/ticker.ask
//                 } else {
//                     // log('NOT FOUND MARKET or TICKER'.red, sell.pair, buy.pair)
//                     // log(_tab, 'MARKET'.blue, sell.market?'denf':'undef'.red, buy.market?'denf':'undef'.red)
//                     // log(_tab, 'TICKER'.green, sell.ticker?'denf':'undef'.red, buy.ticker?'denf':'undef'.red)
//                     // log(markets)
//                     chainBroken = true
//                 }
//
//                 // log( pair.blue, sell, ticker )
//                 value = (value * exchangeRate)*(1.0-fee)
//                 let quoteVolume = 0
//                 let baseVolume = 0
//                 if (ticker && ticker.quoteVolume) quoteVolume = ticker.quoteVolume
//                 if (ticker && ticker.baseVolume) baseVolume = ticker.baseVolume
//                 if (ticker) steps.push( {
//                     pair:pair
//                     ,isSell:isSell
//                     ,fee:fee
//                     ,rate:exchangeRate
//                     ,quoteVolume:quoteVolume
//                     ,baseVolume:baseVolume
//                     ,ticker:ticker
//                     ,market:market
//                     ,value:value
//                 })
//             }
//         } )
//         const profit = value / initialValue - 1
//         const minQuoteVolume = _.min(steps, 'quoteVolume').quoteVolume
//         const minBaseVolume = _.min(steps, 'baseVolume').baseVolume
//         if (!chainBroken && isFinite(profit) && isFinite(minQuoteVolume)) {
//             const stepsCount = loop.length-1
//             const chainData = {
//                 exchange:exchangeName,
//                 profit:profit,
//                 steps:steps,
//                 stepsCount:stepsCount,
//                 stepProfit:(profit/stepsCount),
//                 loop:formatLoop(loop),
//                 startSymbol:loop[0],
//                 exchangeLoop:exchangeName+': '+loop.join(' → '),
//                 minQuoteVolume:minQuoteVolume,
//                 minBaseVolume:minBaseVolume,
//                 minVolume:Math.min(minBaseVolume,minQuoteVolume)
//             }
//             chains.push(chainData)
//         }
//     })
//     return _.sortBy(chains, 'minVolume' )
// }

function filterChains(chains, minProfit=0.01, minVolume=1, startSymbol=null) {
    return _.filter( chains, (chain) => {
        // log(chain)
        return (
            chain.profit > minProfit
            && chain.minVolume > minVolume
            && (!startSymbol || chain.startSymbol === startSymbol)
        )
    })
}

function printChains(chains) {
    _.each( chains, (chain) => {
        if (chain)
            log(colR((chain.profit*100).toFixed(2).toString() + '%').green,
                colR(chain.stepsCount, 4),
                colR((chain.stepProfit*100).toFixed(2).toString() + '%').blue,
                colR(chain.minVolume.toFixed(2)).darkGray, _tab,
                // chain.startSymbol, _tab,
                chain.loop)
    })
}

module.exports.aggregateTickers = aggregateTickers
// module.exports.findDirections=findDirections
// module.exports.filterDirections=filterDirections
// module.exports.printDirections=printDirections
module.exports.printLoops=printLoops
module.exports.createGraph=createGraph
module.exports.findLoops=findLoops
module.exports.findChains=findChains
module.exports.filterChains=filterChains
module.exports.printChains=printChains

