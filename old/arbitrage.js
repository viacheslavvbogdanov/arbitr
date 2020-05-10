"use strict";

const ccxt      = require ('ccxt')
const asTable   = require ('as-table')
const log       = require ('ololog').configure ({ locate: false })

require ('ansicolor').nice;

let printSupportedExchanges = function () {
    log ('Supported exchanges:', ccxt.exchanges.join (', ').green)
}

let printUsage = function () {
    log ('Usage: node', process.argv[1], 'id1'.green, 'id2'.yellow, 'id3'.blue, '...')
    printSupportedExchanges ()
}

let printExchangeSymbolsAndMarkets = function (exchange) {
    log (getExchangeSymbols (exchange))
    log (getExchangeMarketsTable (exchange))
}

let getExchangeMarketsTable = (exchange) => {
    return asTable.configure ({ delimiter: ' | ' }) (Object.values (markets))
}

let sleep = (ms) => new Promise (resolve => setTimeout (resolve, ms));

let proxies = [
        '', // no proxy by default
        'https://crossorigin.me/',
        'https://cors-anywhere.herokuapp.com/',
    ]

;(async function main () {

    // if (process.argv.length > 3) {
    if (true) {

        // let ids = process.argv.slice (2)
        let ids = ccxt.exchanges

        let rmExchange = function( name ) {
            ids.splice(ids.indexOf(name), 1)
        }
        // remove auth-needed exchanges
        // TIMEOUT
        rmExchange('_1broker')
        rmExchange('bibox')
        rmExchange('allcoin')
        rmExchange('bitstamp')   
        rmExchange('btctradeim')   
        // Not Accessed from my location yet
        rmExchange('braziliex')  
        rmExchange('bitflyer')  
        rmExchange('bitlish') 
        rmExchange('bitz') 
        rmExchange('coinegg') 

        rmExchange('bxinth')  // Cloudflare not accessible from this location at the moment
        rmExchange('ccex')  // Cloudflare not accessible from this location at the moment
        rmExchange('coingi')  // Service Temporarily Unavailable Just a moment...
        rmExchange('cobinhood')  // Ssystem request to https://api.cobinhood.com/v1/market/trading_pairs failed
        rmExchange('coinexchange')  // connect ECONNREFUSED
        rmExchange('coinmarketcap') //API offline
        rmExchange('nova') //API offline
        

        let exchanges = {}
        ids.splice(10,999) // TODO remove
        log (ids.join (', ').yellow)

        // load all markets from all exchanges
        let exchangeLoadPromises = []
        for (let id of ids) {

            // instantiate the exchange by id
            

            // save it in a dictionary under its id for future use
            
            // load all markets from the exchange
            // exchangeLoadPromises.push( new Promise( function(){
            //     let exchange = new ccxt[id] ()
            //     exchange.loadMarkets ().then(function(){
            //         exchanges[id] = exchange
            //         log (id.green, 'loaded', exchange.symbols.length, 'markets')
            //         Promise.resolve();
            //     })
            //     .catch(function(e){
            //         log.bright.yellow ('[loadMarkets Error] ' + e.message)
            //         rmExchange(id)
            //         Promise.resolve();
            //     })
            // }) );

          
            try {
                let exchange = new ccxt[id] ()
                let markets = await exchange.loadMarkets ()
                exchanges[id] = exchange
                log (id.green, 'loaded', exchange.symbols.length, 'markets')
                // Promise.resolve();
            } catch(e) {
                log.bright.yellow ('[loadMarkets Error] ' + e.message)
                rmExchange(id);
                // Promise.resolve();
            }
         
            // basic round-robin proxy scheduler
            // let currentProxy = 0
            // let maxRetries   = proxies.length

            // for (let numRetries = 0; numRetries < maxRetries; numRetries++) {

            //     try { // try to load exchange markets using current proxy

            //         exchange.proxy = proxies[currentProxy]
            //         await exchange.loadMarkets ()

            //     } catch (e) { // rotate proxies in case of connectivity errors, catch all other exceptions

            //         // swallow connectivity exceptions only
            //         if (e instanceof ccxt.DDoSProtection || e.message.includes ('ECONNRESET')) {
            //             log.bright.yellow ('[DDoS Protection Error] ' + e.message)
            //         } else if (e instanceof ccxt.RequestTimeout) {
            //             log.bright.yellow ('[Timeout Error] ' + e.message)
            //         } else if (e instanceof ccxt.AuthenticationError) {
            //             log.bright.yellow ('[Authentication Error] ' + e.message)
            //         } else if (e instanceof ccxt.ExchangeNotAvailable) {
            //             log.bright.yellow ('[Exchange Not Available Error] ' + e.message)
            //         } else if (e instanceof ccxt.ExchangeError) {
            //             log.bright.yellow ('[Exchange Error] ' + e.message)
            //         } else {
            //             log.bright.red ('[UNHANDLED] ' + e.message)
            //             // throw e; // rethrow all other exceptions
            //         }

            //         // retry next proxy in round-robin fashion in case of error
            //         currentProxy = ++currentProxy % proxies.length
            //     }
            // }

        }
        await Promise.all(exchangeLoadPromises)

        log ('Loaded all markets'.red)
        log('---------------------'.red)
        log (ids.join (', ').yellow)

        // get all unique symbols
        let uniqueSymbols = ccxt.unique (ccxt.flatten (ids.map (id => (log(id),exchanges[id].symbols))))

        // filter out symbols that are not present on at least two exchanges
        let arbitrableSymbols = uniqueSymbols
            .filter (symbol =>
                ids.filter (id =>
                    (exchanges[id].symbols.indexOf (symbol) >= 0)).length > 1)
            .sort ((id1, id2) => (id1 > id2) ? 1 : ((id2 > id1) ? -1 : 0))

        // print a table of arbitrable symbols
        let table = arbitrableSymbols.map (symbol => {
            let row = { symbol }
            for (let id of ids)
                if (exchanges[id].symbols.indexOf (symbol) >= 0)
                    row[id] = id
            return row
        })

        log (asTable.configure ({ delimiter: ' | ' }) (table))

    } else {

        printUsage ()

    }

    process.exit ()

}) ()