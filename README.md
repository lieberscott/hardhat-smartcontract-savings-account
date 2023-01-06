This contract is based on an article written by Vitalik in Bitcoin Magazine in which he unveils
Ethereum and describes some of the potential use cases.

"Savings accounts - one interesting setup works as follows. Suppose that Alice wants to store a large amount of money, but does not want to risk losing everything if her private key is lose or stolen. She makes a contract with Bob, a semi-trustworthy bank, with the following rules: Alice is allowed to withdraw up to 1 per day, Alice with Bob approval can withdrawn any amount, and Bob alone can withdraw up to 0.05 per day. Normally, Alice will only need small amounts at a time, and if Alice wants more she can prove her identity to Bob and make the withdrawal. If Alice's private key gets stolen, she can run to Bob and move the funds into another contract before the thief gets away with more than 1 of the funds. If Alice loses her private key, Bob will eventually be able to recover her funds. And if Bob turns out to be evil, Alice can withdraw her own funds twenty times faster than he can. In short, all of the security of traditional banking, but with almost none of the trust."
-- Vitalik Buterin, Bitcoin Magazine, Jan. 23, 2014

https://bitcoinmagazine.com/business/ethereum-next-generation-cryptocurrency-decentralized-application-platform-1390528211

In this implementation, a user deploys a new Savings Account from the Savings Account Factory contract, specifying a backup user, and daily withdrawal amounts for both the main user and backup user.

The user's savings account is then a newly deployed contract address where all the withdrawing and depositing take place.

ERC20 tokens may be sent directly to the newly deployed contract address, however, they can only be withdrawn once the main account user specifies withdrawal limits for the specific ERC20 token (withdrawal limits are initialized to 0, and they can only be changed once).

The daily withdrawal is reset every day at 0:00 UTC time. It is not a 24-hour wait time. For example, you can withdraw Monday at 23:59 UTC, and then you can withdraw 2 minutes later on Tuesday at 0:01 UTC. However, the next withdrawal window is Wednesday from 0:00 to 23:59 UTC.

Once a backup user enables a large withdrawal, the main user may make unlimied large withdrawals within that day's window for both Ethereum and ERC20 tokens.