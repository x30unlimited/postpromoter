var fs        = require("fs");
var request   = require("request");
var steem     = require('steem');
var dsteem    = require('dsteem');
var utils     = require('./utils');
var reverse   = require('./reversal')
var claim_acc = require('./claim_account')
var create_acc= require('./create_account')

var test_min_vp = 0

var last_processed_tx_num = -1;

var account           = null;
var transactions      = [];
var outstanding_bids  = [];
var delegators        = [];
var last_round        = [];
var next_round        = [];
var blacklist         = [];
var whitelist         = [];
var config            = null;
var first_load        = true;
var isVoting          = false;
var isRunningSave     = false;
var isRunningProcess  = false;
var isRunningTx       = false;
var last_withdrawal   = null;
var use_delegators    = false;
var round_end_timeout = -1;
var steem_price       = 1;  // This will get overridden with actual prices if a price_feed_url is specified in settings
var sbd_price         = 1;    // This will get overridden with actual prices if a price_feed_url is specified in settings
var version           = 'postpromoter Steemium Fork - 1.0.0';
var client            = null;
var rpc_node          = null;
const hotsigninglink  = 'https://v2.steemconnect.com/sign/transfer?&to={to}&amount={amount}&memo={memo}'
utils.log('Looks like we are in ' + process.env.NODE_ENV + ' mode')

const AUTHOR_PCT = 0.5;

startup();

function startup() {

  // Load the settings from the config file
  loadConfig();
  test_min_vp = config.test_min_vp
  // Connect to the specified RPC node
  rpc_node = config.rpc_nodes ? config.rpc_nodes[0] : (config.rpc_node ? config.rpc_node : 'https://api.steemit.com');
  client = new dsteem.Client(rpc_node);

  utils.log("* START - Version: " + version + " *");
  utils.log("Connected to: " + rpc_node);

  if(config.backup_mode)
    utils.log('*** RUNNING IN BACKUP MODE ***');

  // Load Steem global variables
  utils.updateSteemVariables(client);

  // If the API is enabled, start the web server
  if(config.api && config.api.enabled) {
    var express = require('express');
    var app = express();
    var port = process.env.PORT || config.api.port

    app.use(function(req, res, next) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
      next();
    });

    app.get('/api/bids', (req, res) => {
	    const vp = utils.getVotingPower(account);
	    let effective_vp = vp < test_min_vp ? test_min_vp : vp;
	    const time_til_target_power = vp < test_min_vp ? utils.timeTilTargetPower(vp, test_min_vp) : 0;
	    const vote_value = utils.getVoteValue(100, account, effective_vp);
	    const vote_value_usd = utils.getVoteValueUSD(vote_value, sbd_price, steem_price);
	    const min_total_bids_value_usd = vote_value_usd * AUTHOR_PCT * ((100 - config.max_roi) / 100);
	    const min_total_bids_value_steem = min_total_bids_value_usd / steem_price;
	
	    res.json({
	        current_round: outstanding_bids,
	        next_round: next_round,
	        last_round: last_round,
	        vp: (vp / 100).toFixed(2),
	        max_roi: config.max_roi.toFixed(2),
	        test_min_vp: (test_min_vp / 100).toFixed(2),
	        vote_value: vote_value.toFixed(3),
	        vote_value_usd: vote_value_usd.toFixed(3),
	        min_total_bids_value_steem: min_total_bids_value_steem.toFixed(3),
	        time_til_target_power: time_til_target_power
	    });
	});

	
	app.get('/', (req, res) => {
	    res.send(`
	        <!DOCTYPE html>
	        <html lang="en">
	        <head>
	            <meta charset="UTF-8">
	            <meta name="viewport" content="width=device-width, initial-scale=1.0">
	            <title>Bot Info Page</title>
	            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
	            <style>
	                body {
	                    display: flex;
	                    flex-direction: column;
	                    align-items: center;
	                    justify-content: center;
	                    background-color: #f8f9fa;
	                }
	                .container {
	                    max-width: 888px;
	                }
	                .navbar {
	                    width: 100%;
	                    border-bottom: 2px solid #0d6efd;
	                }
	                .card {
	                    background-color: #e3f2fd;
	                    border: 1px solid #2196f3;
	                }
	                .card-title {
	                    color: #0d6efd;
	                }
	                .nav-link {
	                    color: #0d6efd !important;
	                }
	                .nav-link strong {
	                    color: #d63384 !important;
	                }
	                .mt-custom {
	                    margin-top: 2rem;
	                }
	                .mt-custom-smaller {
	                    margin-top: 1rem;
	                }
	                #countdown {
	                    font-size: 2rem;
	                    font-weight: bold;
	                    margin: 1rem 0;
	                    color: #d63384;
	                }
	            </style>
	        </head>
	        <body>
	            <nav class="navbar navbar-expand-lg navbar-light bg-light">
	                <div class="container">
	                    <a class="navbar-brand" href="#">Stats</a>
	                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
	                        <span class="navbar-toggler-icon"></span>
	                    </button>
	                    <div class="collapse navbar-collapse justify-content-center" id="navbarNav">
	                        <ul class="navbar-nav">
	                            <li class="nav-item">
	                                <a class="nav-link" href="#" id="vp">VP: </a>
	                            </li>
	                            <li class="nav-item">
	                                <a class="nav-link" href="#" id="testMinVp">Min VP: </a>
	                            </li>
	                            <!--li class="nav-item">
	                                <a class="nav-link" href="#" id="voteValue">Vote Value: </a>
	                            </li-->
	                            <li class="nav-item">
	                                <a class="nav-link" href="#" id="voteValueUsd">Vote Value (USD): </a>
	                            </li>
	                            <li class="nav-item">
	                                <a class="nav-link" href="#" id="minTotalBidsValueSteem">Min Bids: </a>
	                            </li>
	                            <li class="nav-item">
	                                <a class="nav-link" href="#" id="maxRoi">Max ROI: </a>
	                            </li>
	                        </ul>
	                    </div>
	                </div>
	            </nav>
	
	            <div class="container my-5 text-center">
	                <div id="countdown"></div>
	                <h1 class="mb-4">Current Round</h1>
	                <div id="currentRound" class="row row-cols-1 g-4"></div>
	                <h1 class="mb-4 mt-custom-smaller">Next Round</h1>
	                <div id="nextRound" class="row row-cols-1 g-4"></div>
	                <h1 class="mb-4 mt-custom">Last Round</h1>
	                <div id="lastRound" class="row row-cols-1 g-4"></div>
	            </div>
	            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
	            <script>
	                let timeTilTargetPower = -1;

 	                function createCard(bid) {
						return \`
							<div class="col-12">
								<div class="card h-100">
									<div class="card-body">
										<h5 class="card-title">Bid from \${bid.sender}</h5>
										<p class="card-text">Amount: \${bid.amount} \${bid.currency}</p>
										<p class="card-text">Author: \${bid.author}</p>
										\${bid.weight !== undefined ? \`<p class="card-text">Vote: \${bid.weight / 100} %</p>\` : ''}
										<a href="\${bid.url}" class="card-link">View Post</a>
									</div>
								</div>
							</div>
						\`;
					}

					function populateCards(round, containerId) {
						const container = document.getElementById(containerId);
						container.innerHTML = '';
						round.forEach(bid => {
							container.innerHTML += createCard(bid);
						});
					}
							 
	                function fetchData() {
	                    fetch('/api/bids')
	                        .then(response => response.json())
	                        .then(data => {
	                            document.getElementById('vp').innerHTML = 'VP: <strong>' + data.vp + '%</strong>';
	                            document.getElementById('testMinVp').innerHTML = 'Min VP: <strong>' + data.test_min_vp + '%</strong>';
	                            //document.getElementById('voteValue').innerHTML = 'Vote Value: <strong>' + data.vote_value + '</strong>';
	                            document.getElementById('voteValueUsd').innerHTML = 'Vote Value (USD): <strong>' + data.vote_value_usd + '</strong>';
	                            document.getElementById('minTotalBidsValueSteem').innerHTML = 'Min Bids (STEEM): <strong>' + data.min_total_bids_value_steem + '</strong>';
	                            document.getElementById('maxRoi').innerHTML = 'Max ROI: <strong>' + data.max_roi + '%</strong>';
	
	                            timeTilTargetPower = data.time_til_target_power;
	                            updateCountdown();

	                            populateCards(data.current_round, 'currentRound');
	                            populateCards(data.next_round, 'nextRound');
	                            populateCards(data.last_round, 'lastRound');
	                        });
	                }
	
	                function formatTime(seconds) {
	                    const hours = Math.floor(seconds / 3600);
	                    const minutes = Math.floor((seconds % 3600) / 60);
	                    const remainingSeconds =  Math.floor(seconds % 60);
	                    return \`\${hours.toString().padStart(2, '0')}:\${minutes.toString().padStart(2, '0')}:\${remainingSeconds.toString().padStart(2, '0')}\`;
	                }
	
	                function updateCountdown() {
	                    const countdownElement = document.getElementById('countdown');
	                    if (timeTilTargetPower > 0) {
	                        countdownElement.innerHTML = 'Time until vote: ' + formatTime(timeTilTargetPower);
	                        timeTilTargetPower--;
	                    } else if (timeTilTargetPower == -1) {
	                        countdownElement.innerHTML = 'Loading..';
	                    } else {
	                        countdownElement.innerHTML = 'Can vote now!';
	                    }
	                }
	
	                fetchData();
	                setInterval(fetchData, 60000);
	
	                setInterval(updateCountdown, 1000);
	            </script>
	        </body>
	        </html>
	    `);
	});
    app.listen(port, () => utils.log('API running on port ' + port))
  }

  // Check if bot state has been saved to disk, in which case load it
  if (fs.existsSync('state.json')) {
	  var state_json = fs.readFileSync("state.json");
	  if (state_json.length > 10) {
      var state = JSON.parse(state_json);

      if (state.transactions)
        transactions = state.transactions;

      if (state.outstanding_bids)
        outstanding_bids = state.outstanding_bids;

      if (state.last_round)
        last_round = state.last_round;

      if (state.next_round)
        next_round = state.next_round;

      if(state.last_withdrawal)
        last_withdrawal = state.last_withdrawal;

      // Removed this for now since api.steemit.com is not returning more than 30 days of account history!
      //if(state.version != version)
      //  updateVersion(state.version, version);

      utils.log('Restored saved bot state: ' + JSON.stringify({ last_trx_id: (transactions.length > 0 ? transactions[transactions.length - 1] : ''), bids: outstanding_bids.length, last_withdrawal: last_withdrawal }));
    }
  }

  // Check whether or not auto-withdrawals are set to be paid to delegators.
  use_delegators = config.auto_withdrawal && config.auto_withdrawal.active && config.auto_withdrawal.accounts.find(a => a.name == '$delegators');

  // If so then we need to load the list of delegators to the account
  if(use_delegators) {
    if(fs.existsSync('delegators.json')) {
      delegators = JSON.parse(fs.readFileSync("delegators.json"));

      var vests = delegators.reduce(function (total, v) { return total + parseFloat(v.vesting_shares); }, 0);
      utils.log('Delegators Loaded (from disk) - ' + delegators.length + ' delegators and ' + vests + ' VESTS in total!');
    }
    else
    {
      var del = require('./delegators');
      utils.log('Started loading delegators from account history...');
      del.loadDelegations(client, config.account, function(d) {
        delegators = d;
        var vests = delegators.reduce(function (total, v) { return total + parseFloat(v.vesting_shares); }, 0);
        utils.log('Delegators Loaded (from account history) - ' + delegators.length + ' delegators and ' + vests + ' VESTS in total!');

        // Save the list of delegators to disk
        saveDelegators();
      });
    }
  }

  // Schedule to run every 10 seconds
  setInterval(startProcess, 10000);

  // Load updated STEEM and SBD prices every 30 minutes
  loadPrices();
  setInterval(loadPrices, 30 * 60 * 1000);
}

function startProcess() {
  // Check if already running
  if(isRunningProcess) {
    utils.log("startProcess() is already running !");
    return;
  }
  isRunningProcess = true;

  // Load the settings from the config file each time so we can pick up any changes
  loadConfig();

  // Load the bot account info
  client.database.getAccounts([config.account]).then(function (result) {
    account = result[0];

    if (account && !isVoting) {
      var vp = utils.getVotingPower(account);

      if(config.detailed_logging) {
        var bids_steem = utils.format(outstanding_bids.reduce(function(t, b) { return t + ((b.currency == 'STEEM') ? b.amount : 0); }, 0), 3);
        var bids_sbd = utils.format(outstanding_bids.reduce(function(t, b) { return t + ((b.currency == 'SBD') ? b.amount : 0); }, 0), 3);
        utils.log((config.backup_mode ? '* BACKUP MODE *' : '') + 'Voting Power: ' + utils.format(vp / 100) + '% | Time until next round: ' + utils.toTimer(utils.timeTilFullPower(vp)) + ' | Bids: ' + outstanding_bids.length + ' | ' + bids_sbd + ' SBD | ' + bids_steem + ' STEEM');
      }
      // We are at 100% voting power - time to vote!
      let min_vp = test_min_vp
      
      // Wrong state fix
      if (vp >= min_vp && next_round.length > 0 && outstanding_bids.length == 0 && round_end_timeout < 0) {
        outstanding_bids = next_round.slice();
        next_round = [];
      }
	    
      if (vp >= min_vp && outstanding_bids.length > 0 && round_end_timeout < 0) {
        round_end_timeout = setTimeout(function() {
          
          // Don't process any bids while we are voting due to race condition (they will be processed when voting is done).
          isVoting = first_load = true;

          // Make a copy of the list of outstanding bids and vote on them
          startVoting(outstanding_bids.slice().reverse());

          // Save the last round of bids for use in API call
          last_round = outstanding_bids.slice();

          // Some bids might have been pushed to the next round, so now move them to the current round
          outstanding_bids = next_round.slice();

          // Reset the next round
          next_round = [];

          // Send out earnings if frequency is set to every round
          if (config.auto_withdrawal.frequency == 'round_end')
            processWithdrawals();

          // Save the state of the bot to disk
          saveState();

          round_end_timeout = -1;
        }, 30 * 1000);
      }

      if (round_end_timeout < 0) {
	      // Load transactions to the bot account
	      getTransactions(saveState);
	      
	      // Check if there are any rewards to claim.
	      claimRewards();
	
	      // Check if it is time to withdraw funds.
	      if (config.auto_withdrawal.frequency == 'daily')
	        checkAutoWithdraw();
      }
    }
    isRunningProcess = false;
  }, function(err) {
    logError('Error loading bot account: ' + err);
    isRunningProcess = false;
  });
}

function startVoting(bids) {
  if(config.backup_mode) {
    utils.log('*** Bidding Round End - Backup Mode, no voting ***');
    setTimeout(function () { isVoting = false; first_load = true; }, 5 * 60 * 1000);
    return;
  }

  // Sum the amounts of all of the bids
  var total = bids.reduce(function(total, bid) {
    return total + getUsdValue(bid);
  }, 0);

  var bids_steem = utils.format(outstanding_bids.reduce(function(t, b) { return t + ((b.currency == 'STEEM') ? b.amount : 0); }, 0), 3);
  var bids_sbd = utils.format(outstanding_bids.reduce(function(t, b) { return t + ((b.currency == 'SBD') ? b.amount : 0); }, 0), 3);
  utils.log('=======================================================');
  utils.log('Bidding Round End! Starting to vote! Total bids: ' + bids.length + ' - $' + total + ' | ' + bids_sbd + ' SBD | ' + bids_steem + ' STEEM');

  var adjusted_weight = 1;
  
  if(config.max_roi != null && config.max_roi != undefined && !isNaN(config.max_roi)) {
    var vp = utils.getVotingPower(account);
    var vote_value = utils.getVoteValue(100, account, vp);
    var vote_value_usd = utils.getVoteValueUSD(vote_value, sbd_price, steem_price)
    //min_total_bids_value_usd: calculates the minimum value in USD that the total bids must have to represent a maximum ROI defined in config.json
    //'max_roi' in config.json = 10 represents a maximum ROI of 10%
    utils.log('VP: ' +  utils.format(vp / 100) + '%, Vote value: ' + vote_value + ', usd: ' + vote_value_usd);
	  
    var min_total_bids_value_usd = vote_value_usd * AUTHOR_PCT * ((100 - config.max_roi) / 100 );
    utils.log('Total bids: ' + total + ', min: ' + min_total_bids_value_usd + ', roi: ' + config.max_roi);
	  
    // calculates the value of the weight of the vote needed to give the maximum ROI defined
    adjusted_weight = (total < min_total_bids_value_usd) ? (total / min_total_bids_value_usd) : 1;
    utils.log('Total vote weight: ' + (config.batch_vote_weight * adjusted_weight));
  }

  utils.log('=======================================================');

  for(var i = 0; i < bids.length; i++) {
    // Calculate the vote weight to be used for each bid based on the amount bid as a percentage of the total bids
    bids[i].weight = Math.round(config.batch_vote_weight * adjusted_weight * 100 * (getUsdValue(bids[i]) / total));
  }

  comment(bids.slice());

  vote(bids);
}

function vote(bids) {
  // Get the first bid in the list
  sendVote(bids.pop(), 0, function () {
    // If there are more bids, vote on the next one after 10 seconds
    if (bids.length > 0) {
      setTimeout(function () { vote(bids); }, 5000);
    } else {
      setTimeout(function () {
        utils.log('=======================================================');
        utils.log('Voting Complete!');
        utils.log('=======================================================');
        isVoting = false;
        first_load = true;
      }, 5000);
    }
  });
}

function comment(bids) {
  sendComment(bids.pop());

  if(bids.length > 0)
    setTimeout(function () { comment(bids); }, 30000);
}

function sendVote(bid, retries, callback) {
  utils.log('Casting: ' + utils.format(bid.weight / 100) + '% vote cast for: @' + bid.author + '/' + bid.permlink);
  
  validatePost(bid.author, bid.permlink, true, function(e) {
    if(e) {
      utils.log('Post @' + bid.author + '/' + bid.permlink + ' is invalid for reason: ' + e);
      refund(bid.sender, bid.amount, bid.currency, e, 0);

      if(callback)
        callback();
    } else {
      client.broadcast.vote({ voter: account.name, author: bid.author, permlink: bid.permlink, weight: bid.weight }, dsteem.PrivateKey.fromString(config.posting_key)).then(function(result) {
        if (result) {
          utils.log(utils.format(bid.weight / 100) + '% vote cast for: @' + bid.author + '/' + bid.permlink);
          powerUp(bid.amount, bid.currency);
          if (callback)
            callback();
        }
      }, function(err) {
        logError('Error sending vote for: @' + bid.author + '/' + bid.permlink + ', Error: ' + err);

        // Try again on error
        if(retries < 2)
          setTimeout(function() { sendVote(bid, retries + 1, callback); }, 10000);
        else {
          utils.log('============= Vote transaction failed three times for: @' + bid.author + '/' + bid.permlink + ' Bid Amount: ' + bid.amount + ' ' + bid.currency + ' ===============');
          logFailedBid(bid, err);

          if (callback)
            callback();
        }
      });
    }
  });
}

function sendComment(bid) {
  var content = null;
  if (config.reversal_enabled) {
    content         = fs.readFileSync(config.comment_reversal_location, "utf8");
    let link_amount = bid.amount * config.reversal_price
    let currency    = bid.currency
    link_amount     = parseFloat(link_amount).toFixed(3) + currency
    let to          = config.account
    let link_memo   = 'reverse%20https://steemit.com/@' + bid.author.replace(/\./g, '') + '/' + bid.permlink
    let link        = hotsigninglink
    link            = link.replace(/\{amount\}/g, link_amount).replace(/\{to\}/g, to).replace(/\{memo\}/g, link_memo)
    content         = content.replace(/\{link\}/g, link).replace(/\{amount\}/g, bid.amount + ' ' + currency).replace(/\{reversal_price\}/g, parseFloat(bid.amount * config.reversal_price).toFixed(3) + ' ' + currency)
  } else if(config.comment_location && config.comment_location != '') {
    content = fs.readFileSync(config.comment_location, "utf8");
  } else if (config.promotion_content && config.promotion_content != '') {
    content = config.promotion_content;
  }

  // If promotion content is specified in the config then use it to comment on the upvoted post
  if (content && content != '') {

    // Generate the comment permlink via steemit standard convention
    var permlink = 're-' + bid.author.replace(/\./g, '') + '-' + bid.permlink + '-' + new Date().toISOString().replace(/-|:|\./g, '').toLowerCase();

    // Replace variables in the promotion content
    content = content.replace(/\{weight\}/g, utils.format(bid.weight / 100)).replace(/\{botname\}/g, config.account).replace(/\{sender\}/g, bid.sender);

    var comment = { 
      author: account.name, 
      permlink: permlink, 
      parent_author: bid.author, 
      parent_permlink: bid.permlink, 
      title: permlink, 
      body: content, 
      json_metadata: '{"app":"postpromoter/' + version + '"}' 
    };

    // Broadcast the comment
    client.broadcast.comment(comment, dsteem.PrivateKey.fromString(config.posting_key)).then(function (result) {
      if (result)
        utils.log('Posted comment: ' + permlink);
    }, function(err) { logError('Error posting comment: ' + permlink); });
  }

  // Check if the bot should resteem this post
  if (config.min_resteem && bid.amount >= config.min_resteem)
    resteem(bid);
}

function resteem(bid) {
  var json = JSON.stringify(['reblog', {
    account: config.account,
    author: bid.author,
    permlink: bid.permlink
  }]);

  client.broadcast.json({ id: 'follow', json: json, required_auths: [], required_posting_auths: [config.account] }, dsteem.PrivateKey.fromString(config.posting_key)).then(function(result) {
    if (result)
      utils.log('Resteemed Post: @' + bid.sender + '/' + bid.permlink);
  }, function(err) {
      utils.log('Error resteeming post: @' + bid.sender + '/' + bid.permlink);
  });
}

function getTransactions(callback) {
  // Check if already running
  if(isRunningTx) {
    utils.log('getTransactions() is already running !');
    return;
  }
  isRunningTx = true;
	
  var last_trx_id = null;
  var num_trans = 50;

  // If this is the first time the bot is ever being run, start with just the most recent transaction
  if (first_load && transactions.length == 0) {
    utils.log('First run - starting with last transaction on account.');
  }

  // If this is the first time the bot is run after a restart get a larger list of transactions to make sure none are missed
  if (first_load && transactions.length > 0) {
    utils.log('First run - loading all transactions since last transaction processed: ' + transactions[transactions.length - 1]);
    last_trx_id = transactions[0];
    num_trans = 200;
  }

  request.get('https://sds.steemworld.org/account_history_api/getHistoryFromStartId/'+account.name+'/-1/'+num_trans, async function (e, r, data) { try {
    result = JSON.parse(data).result.rows;
    result.forEach(function(val, index){
      result[index] = [
        val[0],
        { 
          block: val[2],
          trx_id: val[5] ? '0000000000000000000000000000000000000000' : 'tx-'+val[2]+'-'+val[3],
          op: val[6],
        }
      ];
    })

    var bid_history = result.filter((x) => { return (x[1].op[0] == 'transfer' && x[1].op[1].to == config.account) }).map((x) => x[1].op[1])
    bid_history.forEach((bid) => { // decrypting all bidhistory memos might seem to be redundant, but this way we clear the ground for latter original bid transfer search
      if (bid.memo.startsWith('#') && bid.memo.split(' ').length == 1) {
        try { 
          bid.memo = steem.memo.decode(config.memo_key, bid.memo)
        }catch(e){
          // console.log(e)
          // console.log(bid)
          let trx_id = result.find((x) => x[1].op[1] == bid)[1].trx_id
          transactions.push(trx_id)
          isRunningTx = false
          return
        }
      }
    })

    if (first_load && transactions.length == 0) {
      transactions = result.map(r => r[1].trx_id).filter(t => t != '0000000000000000000000000000000000000000');
      first_load = false;

      utils.log(transactions.length + ' previous trx_ids recorded.');

      if(callback)
        callback();

      isRunningTx = false;
      return;
    }

    first_load = false;
    var reached_starting_trx = false;

    result.reverse();

    for (var i = 0; i < result.length; i++) {
      var trans = result[i];
      var op = trans[1].op;
      
      // Don't need to process virtual ops
      if(trans[1].trx_id == '0000000000000000000000000000000000000000')
        continue;

      // Check that this is a new transaction that we haven't processed already
      if(transactions.indexOf(trans[1].trx_id) < 0) {

        // If the bot was restarted after being stopped for a while, don't process transactions until we're past the last trx_id that was processed
        if(last_trx_id && !reached_starting_trx) {
          if(trans[1].trx_id == last_trx_id)
            reached_starting_trx = true;

          continue;
        }
        
        // Check if tx num is lower than last processed
        if(trans[0] < last_processed_tx_num) {
          if(config.debug_logging)
            utils.log('Skip Transaction Num ' + trans[0] + ' (saved: ' + last_processed_tx_num + ', fetch: ' + result.length + ', size: ' + transactions.length + ')');
          continue;
        } else {
          if(config.debug_logging)
            utils.log('Processing Transaction: ' + JSON.stringify(trans));
          last_processed_tx_num = trans[0];
        }
        
        // We only care about transfers to the bot
        if (op[0] == 'transfer' && op[1].to == config.account) {
          var amount     = parseFloat(op[1].amount);
          var amount_usd = currency == 'STEEM' ? amount * steem_price : amount * sbd_price;
          var currency   = utils.getCurrency(op[1].amount);
          var memo       = op[1].memo;
          var encrypted  = false
          var pubkey     = ''
          var from       = op[1].from;

          utils.log("Incoming Bid! From: " + op[1].from + ", Amount: " + op[1].amount + ", memo: " + op[1].memo);

          // Check for min and max bid values in configuration settings
          var min_bid = config.min_bid ? parseFloat(config.min_bid) : 0;
          var max_bid = config.max_bid ? parseFloat(config.max_bid) : 9999;
          var max_bid_whitelist = config.max_bid_whitelist ? parseFloat(config.max_bid_whitelist) : 9999;

          if (memo.startsWith('#')) { // this is weak method to identify encrypted memos => !! to be improved
            utils.log('encrypted memo detected!')
            encrypted = true
            // find user memo public key
            let account = []
            try {
              account = await client.database.call('get_accounts', [[op[1].from]])
              pubkey = account[0].memo_key             
            } catch(e) {
              console.log(e)
              utils.log('couldnt find users memo public key')
              continue
            }
          }

          // Save the ID of the last transaction that was processed.
          transactions.push(trans[1].trx_id);

          if(transactions.length > 250)
          transactions.shift();

          utils.log(memo)
          var wordsArray = memo.split(' ')
          if (config.reversal_enabled && wordsArray && wordsArray[0].indexOf('reverse') > -1) { // suggestion: make it less common like 'ppflag' as keyword
            // check if memo formatting is right
            if (wordsArray.length != 2) {
              refund(op[1].from, amount, currency, 'invalid_formatting', 0, null, pubkey);
              transactions.push(trans[1].trx_id)
              continue     
            }
            utils.log('Reversal Memo detected!')
            var postURL            = wordsArray[1] // this can be problematic if inputs are fromdifferent UIs (steemit vs steampeak)
            var permlink           = postURL.substr(postURL.lastIndexOf('/') + 1)
            var author             = postURL.substring(postURL.lastIndexOf('@') + 1, postURL.lastIndexOf('/'))
            var reversal_requester = op[1].from
            var match              = bid_history.find((x)=> {
              let bid_permlink = x.memo.substr(x.memo.lastIndexOf('/') + 1)
              let bid_author   = x.memo.substring(x.memo.lastIndexOf('@') + 1, x.memo.lastIndexOf('/'))
              return (bid_permlink == permlink && bid_author == author && x.memo.indexOf('reverse') == -1) 
            })
            var vote_to_reverse    = match ? JSON.parse(JSON.stringify(match)) : undefined

            if (!vote_to_reverse && !first_load) { // second chance for reversal trying to find the bid with a deeper request
              bid_history     = await client.database.call('get_account_history', [account.name, -1, 1000])
              bid_history     = bid_history.filter((x) => { return (x[1].op[0] == 'transfer' && x[1].op[1].to == config.account) }).map((x) => x[1].op[1])
              match           = bid_history.find((x)=> {
                let bid_permlink = x.memo.substr(x.memo.lastIndexOf('/') + 1)
                let bid_author   = x.memo.substring(x.memo.lastIndexOf('@') + 1, x.memo.lastIndexOf('/'))
                return (bid_permlink == permlink && bid_author == author && x.memo.indexOf('reverse') == -1) 
              })
              vote_to_reverse = match ? JSON.parse(JSON.stringify(match)) : undefined
            }
            // vote reversal
            if (vote_to_reverse) {
              utils.log('the bid request to be reversed belongs to @' + vote_to_reverse.from + ', with memo: ' + vote_to_reverse.memo)
              let leftovers_usd = reverse.checkAmount(vote_to_reverse, op[1], config.reversal_price, steem_price, sbd_price, pubkey)
              if (leftovers_usd < -0.01) {
                let memo = config.transfer_memos['reversal_not_funds']
                memo = memo.replace(/{reversal_price}/g, (config.reversal_price * parseFloat(vote_to_reverse.amount)) + ' ' + utils.getCurrency(vote_to_reverse.amount));
                memo = memo.replace(/{postURL}/g, postURL)
                // memo = memo.replace(/{amount}/g, reversal_transfer.amount);
                utils.log(memo)
                if (pubkey.length > 0) memo = steem.memo.encode(config.memo_key, pubkey, ('#' + memo))
                client.broadcast.transfer({ amount: op[1].amount, from: config.account, to: op[1].from, memo: memo}, dsteem.PrivateKey.fromString(config.active_key))
                transactions.push(trans[1].trx_id)
                continue
              }
              reverse.reverseVote(vote_to_reverse, leftovers_usd, pubkey, op[1], steem_price, sbd_price, 0)
              transactions.push(trans[1].trx_id)
              continue // reversals are not regular bids 
            } else {
              utils.log('Reversal permlink wasnt found on bid history')
              let memo = config.transfer_memos['reversal_not_found']
              memo = memo.replace(/{postURL}/g, postURL);
              utils.log(memo)
              if (encrypted) memo = steem.memo.encode(config.memo_key, pubkey, ('#' + memo))
              client.broadcast.transfer({ amount: utils.format(amount, 3) + ' ' + currency, from: config.account, to: reversal_requester, memo: memo}, dsteem.PrivateKey.fromString(config.active_key))
              transactions.push(trans[1].trx_id)
              continue
            }
          }
          // account creation
          if (config.create_account_enabled && wordsArray && wordsArray[0].indexOf('createaccount') > -1) {
            // for acc creation "_" and " " in memo are equivalent
            memo = memo.replace('_', ' ')
            wordsArray = wordsArray.split(' ')
            // check if memo formatting is right
            if (wordsArray.length != 3 && wordsArray.length != 6) {
              console.log(wordsArray)
              refund(op[1].from, amount, currency, 'invalid_formatting', 0, null, pubkey);
              transactions.push(trans[1].trx_id)
              continue     
            }
            utils.log('Create Account Memo detected!')
            let newAccount    = wordsArray[1]
            let priceCurrency = config.create_account_price.indexOf('STEEM') > 0 ? 'STEEM' : 'SBD'
            let leftovers     = parseFloat(amount - parseFloat(config.create_account_price)).toFixed(3) + ' ' + priceCurrency
            if (leftovers < 0) {
              refund(op[1].from, amount, currency, 'create_acc_insufficient', 0, null, pubkey);
              transactions.push(trans[1].trx_id)
              continue             
            } 
            if (currency !== priceCurrency) {
              refund(op[1].from, amount, currency, 'wrong_currency', 0, null, pubkey);
              transactions.push(trans[1].trx_id)
              continue                
            }
            try {
              // whether there are leftovers to send back or not, we need to send back an encrypted memo transfer with credential, and amounts then should equal leftovers
              utils.log('attempting to create account @' + newAccount)
              await create_acc.createAccount(wordsArray)
              utils.log('succesfully created new account: @' + newAccount)
            } catch(e) {
              console.log(e)
              if (e == 'account name already taken') {
                refund(op[1].from, amount, currency, 'taken', 0, newAccount, pubkey);
              } else {
                refund(op[1].from, amount, currency, '504', 0, null, pubkey);
              }
            }
            // in case there are no leftovers to send back, we set a stander microtransfer amount just to confirm via transfer memo
            if (parseFloat(leftovers) == 0) leftovers = '0.001 STEEM'
            refund(op[1].from, parseFloat(leftovers), currency, 'create_acc', 0, newAccount, pubkey);
            transactions.push(trans[1].trx_id)
            continue
          }

          if(config.disabled_mode) {
            // Bot is disabled, refund all Bids
            refund(op[1].from, amount, currency, 'bot_disabled', 0, null, pubkey);
          } else if(amount < min_bid) {
            // Bid amount is too low (make sure it's above the min_refund_amount setting)
            if(!config.min_refund_amount || amount >= config.min_refund_amount)
              refund(op[1].from, amount, currency, 'below_min_bid', 0, null, pubkey);
            else {
              utils.log('Invalid bid - below min bid amount and too small to refund.');
            }
          } else if (amount > max_bid && whitelist.indexOf(op[1].from) < 0) {
            // Bid amount is too high
            refund(op[1].from, amount, currency, 'above_max_bid', 0, null, pubkey);
          } else if (amount > max_bid_whitelist) {
            // Bid amount is too high even for whitelisted users!
            refund(op[1].from, amount, currency, 'above_max_bid_whitelist', 0, null, pubkey);
          } else if(config.currencies_accepted && config.currencies_accepted.indexOf(currency) < 0) {
            // Sent an unsupported currency
            refund(op[1].from, amount, currency, 'invalid_currency', 0, null, pubkey);
          } else {
            // Bid amount is just right!
            checkPost(op[1].memo, amount, currency, op[1].from, 0);
          }
        } else if(use_delegators && op[0] == 'delegate_vesting_shares' && op[1].delegatee == account.name) {
          // If we are paying out to delegators, then update the list of delegators when new delegation transactions come in
          var delegator = delegators.find(d => d.delegator == op[1].delegator);

          if(delegator)
            delegator.new_vesting_shares = op[1].vesting_shares;
          else {
            delegator = { delegator: op[1].delegator, vesting_shares: 0, new_vesting_shares: op[1].vesting_shares };
            delegators.push(delegator);
          }

          // Save the updated list of delegators to disk
          saveDelegators();

          // Check if we should send a delegation message
          if(parseFloat(delegator.new_vesting_shares) > parseFloat(delegator.vesting_shares) && config.transfer_memos['delegation'] && config.transfer_memos['delegation'] != '')
            refund(op[1].delegator, 0.001, 'SBD', 'delegation', 0, utils.vestsToSP(parseFloat(delegator.new_vesting_shares)).toFixed());

          utils.log('*** Delegation Update - ' + op[1].delegator + ' has delegated ' + op[1].vesting_shares);
        }

        // Save the ID of the last transaction that was processed.
        transactions.push(trans[1].trx_id);

        // Don't save more than the last 300 transaction IDs in the state
        if(transactions.length > 300)
          transactions.shift();
      }
    }

    if (callback)
      callback();

    isRunningTx = false;
  } catch (err) {
    utils.log('get_account_history error: ' + err);
    
    if (callback)
      callback();

    isRunningTx = false;
    return;
  }
  });
}

function checkRoundFillLimit(round, amount, currency) {
  if(config.round_fill_limit == null || config.round_fill_limit == undefined || isNaN(config.round_fill_limit))
    return false;

  var vote_value = utils.getVoteValue(100, account, 10000);
  var vote_value_usd = utils.getVoteValueUSD(vote_value, sbd_price, steem_price)
  var bid_value = round.reduce(function(t, b) { return t + b.amount * ((b.currency == 'SBD') ? sbd_price : steem_price) }, 0);
  var new_bid_value = amount * ((currency == 'SBD') ? sbd_price : steem_price);

  // Check if the value of the bids is over the round fill limit

  return (vote_value_usd * AUTHOR_PCT * config.round_fill_limit < bid_value + new_bid_value);

}

function validatePost(author, permlink, isVoting, callback, retries) {
  if (process.env.NODE_ENV == 'test' && callback) callback()
  client.database.call('get_content', [author, permlink]).then(function (result) {
    if (result && result.id > 0) {

        // If comments are not allowed then we need to first check if the post is a comment
        if(!config.allow_comments && (result.parent_author != null && result.parent_author != '')) {
          if(callback)
            callback('no_comments');

          return;
        }

        // Check if any tags on this post are blacklisted in the settings
        if (config.blacklist_settings.blacklisted_tags && config.blacklist_settings.blacklisted_tags.length > 0 && result.json_metadata && result.json_metadata != '') {
          var tags = JSON.parse(result.json_metadata).tags;

          if (tags && tags.length > 0) {
            var tag = tags.find(t => config.blacklist_settings.blacklisted_tags.indexOf(t) >= 0);

            if(tag) {
              if(callback)
                callback('blacklist_tag');

              return;
            }
          }
        }

        var created = new Date(result.created + 'Z');
        var time_until_vote = isVoting ? 0 : utils.timeTilFullPower(utils.getVotingPower(account));

        // Get the list of votes on this post to make sure the bot didn't already vote on it (you'd be surprised how often people double-submit!)
        var votes = result.active_votes.filter(function(vote) { return vote.voter == account.name; });

        if ((votes.length > 0 && votes[0].weight > 0) || ((new Date() - created) >= (config.max_post_age * 60 * 60 * 1000) && !isVoting)) {
            // This post is already voted on by this bot or the post is too old to be voted on
            if(callback)
              callback(((votes.length > 0) ? 'already_voted' : 'max_age'));
            
            return;
        }

        votes = result.active_votes.filter(function(vote) {
            return config.no_vote.includes(vote.voter);
        });

        if ((votes.length > 0 && votes[0].weight > 0)) {
            if(callback)
              callback("Cannot vote a post already voted by " + votes[0].voter + " :| Please try another post.");
            
            return;
        }

        // Check if this post has been flagged by any flag signal accounts
        if(config.blacklist_settings.flag_signal_accounts) {
          var flags = result.active_votes.filter(function(v) { return v.percent < 0 && config.blacklist_settings.flag_signal_accounts.indexOf(v.voter) >= 0; });

          if(flags.length > 0) {
            if(callback)
              callback('flag_signal_account');
            
            return;
          }
        }

        // Check if this post is below the minimum post age
        if(config.min_post_age && config.min_post_age > 0 && (new Date() - created/* + (time_until_vote * 1000)*/) < (config.min_post_age * 60 * 1000)) {
          if(callback)
            callback('min_age');
          
            return;
        }

        // Post is good!
        if(callback)
          callback();
    } else {
      // Invalid memo
      if(callback)
        callback('invalid_post_url');

      return;
    }
  }, function(err) {
      logError('Error loading post: ' + permlink + ', Error: ' + err);

      // Try again on error
      if(retries < 2)
        setTimeout(function() { validatePost(author, permlink, isVoting, callback, retries + 1); }, 3000);
      else {
        utils.log('============= Validate post failed three times for: ' + permlink + ' ===============');
        
        if(callback)
          callback('invalid_post_url');

        return;
      }
    });
}

function checkPost(memo, amount, currency, sender, retries) {
  var affiliate = null;

  // Check if this bid is through an affiliate service
  if(config.affiliates && config.affiliates.length > 0) {
    for(var i = 0; i < config.affiliates.length; i++) {
      var cur = config.affiliates[i];

      if(memo.startsWith(cur.name)) {
        memo = memo.split(' ')[1];
        affiliate = cur;
        break;
      }
    }
  }

  // Parse the author and permlink from the memo URL
    var permLink = memo.substr(memo.lastIndexOf('/') + 1);
    var site = memo.substring(memo.indexOf('://')+3,memo.indexOf('/', memo.indexOf('://')+3));
  switch(site) {
    case 'd.tube':
        var author = memo.substring(memo.indexOf("/v/")+3,memo.lastIndexOf('/'));
        break;
    case 'dmania.lol':
        var author = memo.substring(memo.indexOf("/post/")+6,memo.lastIndexOf('/'));
        break;
    default:
        var author = memo.substring(memo.lastIndexOf('@') + 1, memo.lastIndexOf('/'));
  }

  if (author == '' || permLink == '') {
    refund(sender, amount, currency, 'invalid_post_url', 0);
    return;
  }

  // Make sure the author isn't on the blacklist!
  if(whitelist.indexOf(author) < 0 && (blacklist.indexOf(author) >= 0 || blacklist.indexOf(sender) >= 0))
  {
    handleBlacklist(author, sender, amount, currency);
    return;
  }

  // If this bot is whitelist-only then make sure the sender is on the whitelist
  if(config.blacklist_settings.whitelist_only && whitelist.indexOf(sender) < 0) {
    refund(sender, amount, currency, 'whitelist_only', 0);
    return;
  }

  // Check if this author has gone over the max bids per author per round
  if(config.max_per_author_per_round && config.max_per_author_per_round > 0) {
    if(outstanding_bids.filter(b => b.author == author).length >= config.max_per_author_per_round)
    {
      refund(sender, amount, currency, 'bids_per_round', 0);
      return;
    }
  }

	var push_to_next_round = false;
	checkGlobalBlacklist(author, sender, function(onBlacklist) {
		if(onBlacklist) {
			handleBlacklist(author, sender, amount, currency);
    	return;
		}
		
		validatePost(author, permLink, false, function(error) {
			if(error) {
				refund(sender, amount, currency, error, 0);
				return;
			}
			
			// Do max value vote if round is empty and return the difference
			if(outstanding_bids.length == 0){
				var vote_value = utils.getVoteValue(100, account, 10000);
				var vote_value_usd = utils.getVoteValueUSD(vote_value, sbd_price, steem_price)
				var new_bid_value = amount * ((currency == 'SBD') ? sbd_price : steem_price);

				var refund_value = Math.ceil((new_bid_value - vote_value_usd * AUTHOR_PCT * config.round_fill_limit) / ((currency == 'SBD') ? sbd_price : steem_price) * 1000) / 1000;

				if(refund_value > 0){
					refund(sender, refund_value, currency, 'overbid', 0);
					amount -= refund_value;
				}
			}

			// Check if there is already a bid for this post in the current round
			var existing_bid = outstanding_bids.find(bid => bid.url == memo);
			if(!existing_bid) {
				existing_bid = next_round.find(bid => bid.url == memo);
			}
			if(!existing_bid) {
				existing_bid = last_round.find(bid => bid.url == memo);
			}
			
			// Check if the round is full
			if(!existing_bid && checkRoundFillLimit(outstanding_bids, amount, currency)) {
				if(checkRoundFillLimit(next_round, amount, currency)) {
					refund(sender, amount, currency, 'next_round_full', 0);
					return;
				} else {
					push_to_next_round = true;
					refund(sender, 0.001, currency, 'round_full', 0);
				}
			}

			// Add the bid to the current round or the next round if the current one is full or the post is too new
			var round = (push_to_next_round || error == 'min_age') ? next_round : outstanding_bids;
			
			if(existing_bid) {
				refund(sender, amount, currency, 'A bid with this link already exists !', 0);
				return;
				/*
				// There is already a bid for this post in the current round
				utils.log('Existing Bid Found - New Amount: ' + amount + ', Total Amount: ' + (existing_bid.amount + amount));

				var new_amount = 0;

				if(existing_bid.currency == currency) {
					new_amount = existing_bid.amount + amount;
				} else if(existing_bid.currency == 'STEEM') {
					new_amount = existing_bid.amount + amount * sbd_price / steem_price;
				} else if(existing_bid.currency == 'SBD') {
					new_amount = existing_bid.amount + amount * steem_price / sbd_price;
				}

				var vote_value = utils.getVoteValue(100, account, test_min_vp);
				var vote_value_usd = utils.getVoteValueUSD(vote_value, sbd_price, steem_price)
				var new_bid_value = new_amount;

				var refund_value = Math.ceil((new_bid_value - vote_value_usd * AUTHOR_PCT * config.round_fill_limit) / ((currency == 'SBD') ? sbd_price : steem_price) * 1000) / 1000 ;

				utils.log('Vote : ' + vote_value + ', Vote USD: ' + vote_value_usd + ', New Amount: ' + new_bid_value + ' ' + currency + ', Refund: ' + refund_value + ' ' + currency);
				
				if(refund_value > 0){
					refund(sender, refund_value, currency, 'overbid');
					amount -= refund_value;
					new_bid_value -= refund_value * ((currency == 'SBD') ? sbd_price : steem_price);
				}
				
				if(amount > 0){
					existing_bid.amount = new_bid_value;
					powerUp(amount, currency);
				}*/
			} else {
				// All good - push to the array of valid bids for this round
				utils.log('Valid Bid - Amount: ' + amount + ' ' + currency + ', Url: ' + memo);
				round.push({ amount: push_to_next_round ? (amount * 1000 - 1) / 1000 : amount, currency: currency, sender: sender, author: author, permlink: permLink, url: memo });

				// If this bid is through an affiliate service, send the fee payout
				if(affiliate) {
					refund(affiliate.beneficiary, amount * (affiliate.fee_pct / 10000), currency, 'affiliate', 0, 'Sender: @' + sender + ', Post: ' + memo);
					//powerUp(amount - amount * (affiliate.fee_pct / 10000) - (push_to_next_round ? 0.001 : 0), currency);
				} //else
					//powerUp(amount - (push_to_next_round ? 0.001 : 0), currency);
				
			}
			
			// If a witness_vote transfer memo is set, check if the sender votes for the bot owner as witness and send them a message if not
			if (config.transfer_memos['witness_vote'] && config.transfer_memos['witness_vote'] != '') {
				checkWitnessVote(sender, sender, currency);
			} else if(!push_to_next_round && config.transfer_memos['bid_confirmation'] && config.transfer_memos['bid_confirmation'] != '') {
				// Send bid confirmation transfer memo if one is specified
				refund(sender, 0.001, currency, 'bid_confirmation', 0);
			}
		});
	});
}

function powerUp(amount, currency) {
	if(config.auto_powerup && config.auto_powerup === true && currency == 'STEEM') {
		client.broadcast.sendOperations([
			Operation = [
				'transfer_to_vesting', {
					'from': config.account,
					'to': config.account,
					'amount': utils.format(amount, 3) + ' STEEM'
				}
			]
		], dsteem.PrivateKey.fromString(config.active_key));
	}
	
	if(config.auto_cash_out && config.auto_cash_out === true) {
		client.broadcast.sendOperations([
			Operation = [
				'transfer', {
					'from': config.account,
					'to': config.owner_account,
					'amount': utils.format(amount, 3) + ' ' + currency,
					'memo': ''
				}
			]
		], dsteem.PrivateKey.fromString(config.active_key));
	}
}

function checkGlobalBlacklist(author, sender, callback) {
	if(!config.blacklist_settings || !config.blacklist_settings.global_api_blacklists || !Array.isArray(config.blacklist_settings.global_api_blacklists)) {
		callback(null);
		return;
	}

	request.get('http://blacklist.usesteem.com/user/' + author, function(e, r, data) {
		try {
			var result = JSON.parse(data);
			
			if(!result.blacklisted || !Array.isArray(result.blacklisted)) {
				callback(null);
				return;
			}

			if(author != sender) {
				checkGlobalBlacklist(sender, sender, callback);
			} else 
				callback(config.blacklist_settings.global_api_blacklists.find(b => result.blacklisted.indexOf(b) >= 0));
		} catch(err) {
			utils.log('Error loading global blacklist info for user @' + author + ', Error: ' + err);
			callback(null);
		}
	});
}

function handleBlacklist(author, sender, amount, currency) {
  utils.log('Invalid Bid - @' + author + ((author != sender) ? ' or @' + sender : '') + ' is on the blacklist!');

  // Refund the bid only if blacklist_refunds are enabled in config
  if (config.blacklist_settings.refund_blacklist)
    refund(sender, amount, currency, 'blacklist_refund', 0);
  else {
    // Otherwise just send a 0.001 transaction with blacklist memo
    if (config.transfer_memos['blacklist_no_refund'] && config.transfer_memos['blacklist_no_refund'] != '')
      refund(sender, 0.001, currency, 'blacklist_no_refund', 0);

    // If a blacklist donation account is specified then send funds from blacklisted users there
    if (config.blacklist_settings.blacklist_donation_account)
      refund(config.blacklist_settings.blacklist_donation_account, amount - 0.001, currency, 'blacklist_donation', 0);
  }
}

function handleFlag(sender, amount, currency) {
  utils.log('Invalid Bid - This post has been flagged by one or more spam / abuse indicator accounts.');

  // Refund the bid only if blacklist_refunds are enabled in config
  if (config.blacklist_settings.refund_blacklist)
    refund(sender, amount, currency, 'flag_refund', 0);
  else {
    // Otherwise just send a 0.001 transaction with blacklist memo
    if (config.transfer_memos['flag_no_refund'] && config.transfer_memos['flag_no_refund'] != '')
      refund(sender, 0.001, currency, 'flag_no_refund', 0);

    // If a blacklist donation account is specified then send funds from blacklisted users there
    if (config.blacklist_settings.blacklist_donation_account)
      refund(config.blacklist_settings.blacklist_donation_account, amount - 0.001, currency, 'blacklist_donation', 0);
  }
}

function checkWitnessVote(sender, voter, currency) {
  if(!config.owner_account || config.owner_account == '')
    return;

  client.database.getAccounts([voter]).then(function (result) {
    if (result) {
      if (result[0].proxy && result[0].proxy != '') {
        checkWitnessVote(sender, result[0].proxy, currency);
        return;
      }

      if(result[0].witness_votes.indexOf(config.owner_account) < 0)
        refund(sender, 0.001, currency, 'witness_vote', 0);
		  else if(config.transfer_memos['bid_confirmation'] && config.transfer_memos['bid_confirmation'] != '') {
				// Send bid confirmation transfer memo if one is specified
				refund(sender, 0.001, currency, 'bid_confirmation', 0);
			}
    } 
  }, function(err) {
    logError('Error loading sender account to check witness vote: ' + err);
  });
}

function saveState() {
  // Check if already running
  if(isRunningSave) {
    utils.log("saveState() is already running !");
    return;
  }
  isRunningSave = true;
	
  var state = {
    outstanding_bids: outstanding_bids,
    last_round: last_round,
    next_round: next_round,
    transactions: transactions,
    last_withdrawal: last_withdrawal,
    version: version
  };

  // Save the state of the bot to disk
  fs.writeFile('state.json', JSON.stringify(state, null, 2), function (err) {
    if (err)
      utils.log(err);
    isRunningSave = false;
  });
}

function updateVersion(old_version, new_version) {
  utils.log('**** Performing Update Steps from version: ' + old_version + ' to version: ' + new_version);

  if(!old_version) {
    if(fs.existsSync('delegators.json')) {
      fs.rename('delegators.json', 'old-delegators.json', (err) => {
        if (err)
          utils.log('Error renaming delegators file: ' + err);
        else
          utils.log('Renamed delegators.json file so it will be reloaded from account history.');
      });
    }
  }
}

function saveDelegators() {
    // Save the list of delegators to disk
    fs.writeFile('delegators.json', JSON.stringify(delegators), function (err) {
      if (err)
        utils.log('Error saving delegators to disk: ' + err);
    });
}

function refund(sender, amount, currency, reason, retries, data, pubkey) {
  if(config.backup_mode) {
    utils.log('Backup Mode - not sending refund of ' + amount + ' ' + currency + ' to @' + sender + ' for reason: ' + reason);
    return;
  }

  // Make sure refunds are enabled and the sender isn't on the no-refund list (for exchanges and things like that).
  if (reason != 'forward_payment' && (!config.refunds_enabled || sender == config.account || (config.no_refund && config.no_refund.indexOf(sender) >= 0))) {
    utils.log("Invalid bid - " + reason + ' NO REFUND');

    // If this is a payment from an account on the no_refund list, forward the payment to the post_rewards_withdrawal_account
    if(config.no_refund && config.no_refund.indexOf(sender) >= 0 && config.post_rewards_withdrawal_account && config.post_rewards_withdrawal_account != '' && sender != config.post_rewards_withdrawal_account)
      refund(config.post_rewards_withdrawal_account, amount, currency, 'forward_payment', 0, sender);

    return;
  }

  // Replace variables in the memo text
  var memo = config.transfer_memos[reason];

  if(!memo)
    memo = reason;

  memo = memo.replace(/{amount}/g, utils.format(amount, 3) + ' ' + currency);
  memo = memo.replace(/{currency}/g, currency);
  memo = memo.replace(/{min_bid}/g, config.min_bid);
  memo = memo.replace(/{max_bid}/g, config.max_bid);
  memo = memo.replace(/{max_bid_whitelist}/g, config.max_bid_whitelist);
  memo = memo.replace(/{account}/g, config.account);
  memo = memo.replace(/{owner}/g, config.owner_account);
  memo = memo.replace(/{min_age}/g, config.min_post_age);
	memo = memo.replace(/{sender}/g, sender);
  memo = memo.replace(/{tag}/g, data);
  memo = memo.replace(/{name}/g, data);
  memo = memo.replace(/{create_account_price_usd}/g, config.create_account_price_usd);


  var days = Math.floor(config.max_post_age / 24);
  var hours = (config.max_post_age % 24);
  memo = memo.replace(/{max_age}/g, days + ' Day(s)' + ((hours > 0) ? ' ' + hours + ' Hour(s)' : ''));
  // if the bid was sent encrypted, we encrypt it back
  if (pubkey && pubkey.length > 1) memo = steem.memo.encode(config.memo_key, pubkey, ('#' + memo))
  // Issue the refund.
  client.broadcast.transfer({ amount: utils.format(amount, 3) + ' ' + currency, from: config.account, to: sender, memo: retries > 0 ? memo + ' (retry ' + retries + ')' : memo }, dsteem.PrivateKey.fromString(config.active_key)).then(function(response) {
    utils.log('Refund of ' + amount + ' ' + currency + ' sent to @' + sender + ' for reason: ' + reason);
  }, function(err) {
    logError('Error sending refund to @' + sender + ' for: ' + amount + ' ' + currency + ', count: ' + (retries + 1) + ',  Error: ' + err);

    // Try again on error

    if(retries < 5)
      setTimeout(function() { refund(sender, amount, currency, reason, retries + 1, data, pubkey) }, (Math.floor(Math.random() * 10) + 10) * 1000);
    else
      utils.log('============= Refund failed 5 times for: @' + sender + ' ===============');
  });
}

function claimRewards() {
  if (!config.auto_claim_rewards || config.backup_mode)
    return;

  // Make api call only if you have actual reward
  if (parseFloat(account.reward_steem_balance) > 0 || parseFloat(account.reward_sbd_balance) > 0 || parseFloat(account.reward_vesting_balance) > 0) {
    var op = ['claim_reward_balance', { account: config.account, reward_sbd: account.reward_sbd_balance, reward_steem: account.reward_steem_balance, reward_vests: account.reward_vesting_balance }];
    client.broadcast.sendOperations([op], dsteem.PrivateKey.fromString(config.posting_key)).then(function(result) {
      if (result) {
        if(config.detailed_logging) {
          var rewards_message = "$$$ ==> Rewards Claim";
          if (parseFloat(account.reward_sbd_balance) > 0) { rewards_message = rewards_message + ' SBD: ' + parseFloat(account.reward_sbd_balance); }
          if (parseFloat(account.reward_steem_balance) > 0) { rewards_message = rewards_message + ' STEEM: ' + parseFloat(account.reward_steem_balance); }
          if (parseFloat(account.reward_vesting_balance) > 0) { rewards_message = rewards_message + ' VESTS: ' + parseFloat(account.reward_vesting_balance); }

          utils.log(rewards_message);
        }

        // If there are liquid SBD rewards, withdraw them to the specified account
        if(parseFloat(account.reward_sbd_balance) > 0 && config.post_rewards_withdrawal_account && config.post_rewards_withdrawal_account != '') {

          // Send liquid post rewards to the specified account
          client.broadcast.transfer({ amount: account.reward_sbd_balance, from: config.account, to: config.post_rewards_withdrawal_account, memo: 'Liquid Post Rewards Withdrawal' }, dsteem.PrivateKey.fromString(config.active_key)).then(function(response) {
            utils.log('$$$ Auto withdrawal - liquid post rewards: ' + account.reward_sbd_balance + ' sent to @' + config.post_rewards_withdrawal_account);
          }, function(err) { utils.log('Error transfering liquid SBD post rewards: ' + err); });
        }

				// If there are liquid STEEM rewards, withdraw them to the specified account
        if(parseFloat(account.reward_steem_balance) > 0 && config.post_rewards_withdrawal_account && config.post_rewards_withdrawal_account != '') {

          // Send liquid post rewards to the specified account
          client.broadcast.transfer({ amount: account.reward_steem_balance, from: config.account, to: config.post_rewards_withdrawal_account, memo: 'Liquid Post Rewards Withdrawal' }, dsteem.PrivateKey.fromString(config.active_key)).then(function(response) {
            utils.log('$$$ Auto withdrawal - liquid post rewards: ' + account.reward_steem_balance + ' sent to @' + config.post_rewards_withdrawal_account);
          }, function(err) { utils.log('Error transfering liquid STEEM post rewards: ' + err); });
        }
      }
    }, function(err) { utils.log('Error claiming rewards...will try again next time.'); });
  }
}

function checkAutoWithdraw() {
  // Check if auto-withdraw is active
  if (!config.auto_withdrawal.active)
    return;

  // If it's past the withdrawal time and we haven't made a withdrawal today, then process the withdrawal
  if (new Date(new Date().toDateString()) > new Date(last_withdrawal) && new Date().getHours() >= config.auto_withdrawal.execute_time) {
    processWithdrawals();
  }
}

function processWithdrawals() {
  if(config.backup_mode)
    return;

  var has_sbd = config.currencies_accepted.indexOf('SBD') >= 0 && parseFloat(account.sbd_balance) > 0;
  var has_steem = config.currencies_accepted.indexOf('STEEM') >= 0 && parseFloat(account.balance) > 0;

  if (has_sbd || has_steem) {

    // Save the date of the last withdrawal
    last_withdrawal = new Date().toDateString();

    var total_stake = config.auto_withdrawal.accounts.reduce(function (total, info) { return total + info.stake; }, 0);

    var withdrawals = [];

    for(var i = 0; i < config.auto_withdrawal.accounts.length; i++) {
      var withdrawal_account = config.auto_withdrawal.accounts[i];

      // If this is the special $delegators account, split it between all delegators to the bot
      if(withdrawal_account.name == '$delegators') {
        // Check if/where we should send payout for SP in the bot account directly
        if(withdrawal_account.overrides) {
          var bot_override = withdrawal_account.overrides.find(o => o.name == config.account);

          if(bot_override && bot_override.beneficiary) {
            var bot_delegator = delegators.find(d => d.delegator == config.account);

            // Calculate the amount of SP in the bot account and add/update it in the list of delegators
            var bot_vesting_shares = (parseFloat(account.vesting_shares) - parseFloat(account.delegated_vesting_shares)).toFixed(6) + ' VESTS';

            if(bot_delegator)
              bot_delegator.vesting_shares = bot_vesting_shares;
            else
              delegators.push({ delegator: config.account, vesting_shares: bot_vesting_shares });
          }
        }

        // Get the total amount delegated by all delegators
        var total_vests = delegators.reduce(function (total, v) { return total + parseFloat(v.vesting_shares); }, 0);

        // Send the withdrawal to each delegator based on their delegation amount
        for(var j = 0; j < delegators.length; j++) {
          var delegator = delegators[j];
          var to_account = delegator.delegator;

          // Check if this delegator has an override and if so send the payment to the beneficiary instead
          if(withdrawal_account.overrides) {
            var override = withdrawal_account.overrides.find(o => o.name == to_account);

            if(override && override.beneficiary)
              to_account = override.beneficiary;
          }

          if(has_sbd) {
            // Check if there is already an SBD withdrawal to this account
            var withdrawal = withdrawals.find(w => w.to == to_account && w.currency == 'SBD');

            if(withdrawal) {
              withdrawal.amount += parseFloat(account.sbd_balance) * (withdrawal_account.stake / total_stake) * (parseFloat(delegator.vesting_shares) / total_vests) - 0.001;
            } else {
              withdrawals.push({
                to: to_account,
                currency: 'SBD',
                amount: parseFloat(account.sbd_balance) * (withdrawal_account.stake / total_stake) * (parseFloat(delegator.vesting_shares) / total_vests) - 0.001
              });
            }
          }

          if(has_steem) {
            // Check if there is already a STEEM withdrawal to this account
            var withdrawal = withdrawals.find(w => w.to == to_account && w.currency == 'STEEM');

            if(withdrawal) {
              withdrawal.amount += parseFloat(account.balance) * (withdrawal_account.stake / total_stake) * (parseFloat(delegator.vesting_shares) / total_vests) - 0.001;
            } else {
              withdrawals.push({
                to: to_account,
                currency: 'STEEM',
                amount: parseFloat(account.balance) * (withdrawal_account.stake / total_stake) * (parseFloat(delegator.vesting_shares) / total_vests) - 0.001
              });
            }
          }
        }
      } else {
        if(has_sbd) {
          // Check if there is already an SBD withdrawal to this account
          var withdrawal = withdrawals.find(w => w.to == withdrawal_account.name && w.currency == 'SBD');

          if(withdrawal) {
            withdrawal.amount += parseFloat(account.sbd_balance) * withdrawal_account.stake / total_stake - 0.001;
          } else {
            withdrawals.push({
              to: withdrawal_account.name,
              currency: 'SBD',
              amount: parseFloat(account.sbd_balance) * withdrawal_account.stake / total_stake - 0.001
            });
          }
        }

        if(has_steem) {
          // Check if there is already a STEEM withdrawal to this account
          var withdrawal = withdrawals.find(w => w.to == withdrawal_account.name && w.currency == 'STEEM');

          if(withdrawal) {
            withdrawal.amount += parseFloat(account.balance) * withdrawal_account.stake / total_stake - 0.001;
          } else {
            withdrawals.push({
              to: withdrawal_account.name,
              currency: 'STEEM',
              amount: parseFloat(account.balance) * withdrawal_account.stake / total_stake - 0.001
            });
          }
        }
      }
    }

    // Check if the memo should be encrypted
    var encrypt = (config.auto_withdrawal.memo.startsWith('#') && config.memo_key && config.memo_key != '');

    if(encrypt) {
      // Get list of unique withdrawal account names
      var account_names = withdrawals.map(w => w.to).filter((v, i, s) => s.indexOf(v) === i);

      // Load account info to get memo keys for encryption
      client.database.getAccounts(account_names).then(function (result) {
        if (result) {
          for(var i = 0; i < result.length; i++) {
            var withdrawal_account = result[i];
            var matches = withdrawals.filter(w => w.to == withdrawal_account.name);

            for(var j = 0; j < matches.length; j++) {
              matches[j].memo_key = withdrawal_account.memo_key;
            }
          }

          sendWithdrawals(withdrawals);
        }
      }, function(err) {
        logError('Error loading withdrawal accounts: ' + err);
      });
    } else
      sendWithdrawals(withdrawals);
  }

  updateDelegations();
}

function updateDelegations() {
  var updates = delegators.filter(d => parseFloat(d.new_vesting_shares) >= 0);

  for (var i = 0; i < updates.length; i++) {
    var delegator = updates[i];

    delegator.vesting_shares = delegator.new_vesting_shares;
    delegator.new_vesting_shares = null;
  }

  saveDelegators();
}

function sendWithdrawals(withdrawals) {
  // Send out withdrawal transactions one at a time
  sendWithdrawal(withdrawals.pop(), 0, function() {
    // If there are more withdrawals, send the next one.
    if (withdrawals.length > 0)
      sendWithdrawals(withdrawals);
    else
      utils.log('========== Withdrawals Complete! ==========');
  });
}

function sendWithdrawal(withdrawal, retries, callback) {
  if(parseFloat(utils.format(withdrawal.amount, 3)) <= 0) {
    if(callback)
      callback();

    return;
  }

  var formatted_amount = utils.format(withdrawal.amount, 3).replace(/,/g, '') + ' ' + withdrawal.currency;
  var memo = config.auto_withdrawal.memo.replace(/\{balance\}/g, formatted_amount);

  // Encrypt memo
  if (memo.startsWith('#') && config.memo_key && config.memo_key != '')
    memo = steem.memo.encode(config.memo_key, withdrawal.memo_key, memo);

  // Send the withdrawal amount to the specified account
  client.broadcast.transfer({ amount: formatted_amount, from: config.account, to: withdrawal.to, memo: memo }, dsteem.PrivateKey.fromString(config.active_key)).then(function(response) {
    utils.log('$$$ Auto withdrawal: ' + formatted_amount + ' sent to @' + withdrawal.to);

    if(callback)
      callback();
  }, function(err) {
    logError('Error sending withdrawal transaction to: ' + withdrawal.to + ', Error: ' + err);

    // Try again once if there is an error
    if(retries < 1)
      setTimeout(function() { sendWithdrawal(withdrawal, retries + 1, callback); }, 3000);
    else {
      utils.log('============= Withdrawal failed two times to: ' + withdrawal.to + ' for: ' + formatted_amount + ' ===============');

      if(callback)
        callback();
    }
  });
}

function loadPrices() {
  if(config.price_source == 'coinmarketcap') {
    // Load the price feed data
    request.get('https://api.coinmarketcap.com/v1/ticker/steem/', function (e, r, data) {
      try {
        steem_price = parseFloat(JSON.parse(data)[0].price_usd);

        utils.log("Loaded STEEM price: " + steem_price);
      } catch (err) {
        utils.log('Error loading STEEM price: ' + err);
      }
    });

    // Load the price feed data
    request.get('https://api.coinmarketcap.com/v1/ticker/steem-dollars/', function (e, r, data) {
      try {
        sbd_price = parseFloat(JSON.parse(data)[0].price_usd);

        utils.log("Loaded SBD price: " + sbd_price);
      } catch (err) {
        utils.log('Error loading SBD price: ' + err);
      }
    });
  } else if (config.price_source && config.price_source.startsWith('http')) {
    request.get(config.price_source, function (e, r, data) {
      try {
        sbd_price = parseFloat(JSON.parse(data).sbd_price);
        steem_price = parseFloat(JSON.parse(data).steem_price);

        utils.log("Loaded STEEM price: " + steem_price);
        utils.log("Loaded SBD price: " + sbd_price);
      } catch (err) {
        utils.log('Error loading STEEM/SBD prices: ' + err);
      }
    });
  } else if(config.price_source == 'bittrex') {
    // Load STEEM price in BTC from bittrex and convert that to USD using BTC price in coinmarketcap
    request.get('https://global.bittrex.com/api/v1.1/public/getticker?market=USD-BTC', function (e, r, data) {
      request.get('https://global.bittrex.com/api/v1.1/public/getticker?market=BTC-STEEM', function (e, r, btc_data) {
        try {
          steem_price = parseFloat(JSON.parse(data).result.Last) * parseFloat(JSON.parse(btc_data).result.Last);
          utils.log('Loaded STEEM Price from Bittrex: ' + steem_price);
        } catch (err) {
          utils.log('Error loading STEEM price from Bittrex: ' + err);
        }
      });

      request.get('https://global.bittrex.com/api/v1.1/public/getticker?market=BTC-SBD', function (e, r, btc_data) {
        try {
          sbd_price = parseFloat(JSON.parse(data).result.Last) * parseFloat(JSON.parse(btc_data).result.Last);
          utils.log('Loaded SBD Price from Bittrex: ' + sbd_price);
        } catch (err) {
          utils.log('Error loading SBD price from Bittrex: ' + err);
        }
      });
    });
  } else {
    request.get('https://api.coingecko.com/api/v3/simple/price?ids=steem-dollars%2Csteem&vs_currencies=usd', function (e, r, data) {
      try {
        steem_price = parseFloat(JSON.parse(data)['steem'].usd);
        utils.log('Loaded STEEM Price from CoinGecko: ' + steem_price);
      } catch (err) {
        utils.log('Error loading STEEM price from CoinGecko: ' + err);
      }
      try {
        sbd_price = parseFloat(JSON.parse(data)['steem-dollars'].usd);
        utils.log('Loaded SBD Price from CoinGecko: ' + sbd_price);
      } catch (err) {
        utils.log('Error loading SBD price from CoinGecko: ' + err);
      }
    });
  }
}

function getUsdValue(bid) { return bid.amount * ((bid.currency == 'SBD') ? sbd_price : steem_price); }

function logFailedBid(bid, message) {
  try {
    message = JSON.stringify(message);

    if (message.indexOf('assert_exception') >= 0 && message.indexOf('ERR_ASSERTION') >= 0)
      return;

    var failed_bids = [];

    if(fs.existsSync("failed-bids.json"))
      failed_bids = JSON.parse(fs.readFileSync("failed-bids.json"));

    bid.error = message;
    failed_bids.push(bid);

    fs.writeFile('failed-bids.json', JSON.stringify(failed_bids), function (err) {
      if (err)
        utils.log('Error saving failed bids to disk: ' + err);
    });
  } catch (err) {
    utils.log(err);
  }
}

function logFailedReversal(reversal, message) {
  try {
    message = JSON.stringify(message);

    if (message.indexOf('assert_exception') >= 0 && message.indexOf('ERR_ASSERTION') >= 0)
      return;

    var failed_reversals = [];

    if(fs.existsSync("failed-reversals.json"))
      failed_reversals = JSON.parse(fs.readFileSync("failed-reversals.json"));

    reversal.error = message;
    failed_reversals.push(reversal);

    fs.writeFile('failed-reversals.json', JSON.stringify(failed_reversals), function (err) {
      if (err)
        utils.log('Error saving failed reversals to disk: ' + err);
    });
  } catch (err) {
    utils.log(err);
  }
}

function loadConfig() {
  config = JSON.parse(fs.readFileSync("config.json"));

  // Backwards compatibility for blacklist settings
  if(!config.blacklist_settings) {
    config.blacklist_settings = {
      flag_signal_accounts: config.flag_signal_accounts,
      blacklist_location: config.blacklist_location ? config.blacklist_location : 'blacklist',
      refund_blacklist: config.refund_blacklist,
      blacklist_donation_account: config.blacklist_donation_account,
      blacklisted_tags: config.blacklisted_tags
    };
  }

  var newBlacklist = [];

  // Load the blacklist
  utils.loadUserList(config.blacklist_settings.blacklist_location, function(list1) {
    var list = [];

    if(list1)
      list = list1;

    // Load the shared blacklist
    utils.loadUserList(config.blacklist_settings.shared_blacklist_location, function(list2) {
      if(list2)
        list = list.concat(list2.filter(i => list.indexOf(i) < 0));

      if(list1 || list2)
        blacklist = list;
    });
  });

  // Load the whitelist
  utils.loadUserList(config.blacklist_settings.whitelist_location, function(list) {
    if(list)
      whitelist = list;
  });
}

function failover() {
  if(config.rpc_nodes && config.rpc_nodes.length > 1) {
    utils.log('Failing over attempt from: ' + rpc_node);
    
    // Give it a minute after the failover to account for more errors coming in from the original node
    setTimeout(function() { error_count = 0; }, 60 * 1000);

    var cur_node_index = config.rpc_nodes.indexOf(rpc_node) + 1;

    if(cur_node_index == config.rpc_nodes.length)
      cur_node_index = 0;

    rpc_node = config.rpc_nodes[cur_node_index];

    client = new dsteem.Client(rpc_node);
    utils.log('');
    utils.log('***********************************************');
    utils.log('Failing over to: ' + rpc_node);
    utils.log('***********************************************');
    utils.log('');
  }
}

var error_count = 0;
function logError(message) {
  // Don't count assert exceptions for node failover
  if (message.indexOf('assert_exception') < 0 && message.indexOf('ERR_ASSERTION') < 0)
    error_count++;

  utils.log('Error Count: ' + error_count + ', Current node: ' + rpc_node);
  utils.log(message);
  failover()
}

// Check if 10+ errors have happened in a 3-minute period and fail over to next rpc node
function checkErrors() {
  if(error_count >= 10)
    failover();

  // Reset the error counter
  error_count = 0;
}
//setInterval(checkErrors, 1 * 60 * 1000);
