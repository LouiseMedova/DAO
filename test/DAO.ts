import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ethers, network } from 'hardhat'
import { expect } from 'chai'

import BigNumber from 'bignumber.js'
BigNumber.config({ EXPONENTIAL_AT: 60 })

import Web3 from 'web3'
// @ts-ignore
const web3 = new Web3(network.provider) as Web3
  
import { Token, DAO } from '../typechain'

let token: Token
let dao: DAO
let admin: SignerWithAddress
let user1: SignerWithAddress
let user2: SignerWithAddress
let user3: SignerWithAddress
let user4: SignerWithAddress
let user5: SignerWithAddress
let recipient: SignerWithAddress

describe('Contract: Pool', () => {
	beforeEach(async () => {
		[admin, user1, user2, user3, user4, user5, recipient] = await ethers.getSigners()

        let Token = await ethers.getContractFactory('Token')
        token = await Token.deploy('Token_A', 'TKA') as Token
        
        let DAO = await ethers.getContractFactory('DAO')
        dao = await DAO.deploy(86400, token.address, 800) as DAO

        const member = web3.utils.keccak256("MEMBER")

        await dao.grantRole(member, user1.address);
        await dao.grantRole(member, user2.address);
        await dao.grantRole(member, user3.address);
        await dao.grantRole(member, user4.address);
        await dao.grantRole(member, user5.address);

        await token.transfer(user1.address, 1000);
        await token.transfer(user2.address, 1000);
        await token.transfer(user3.address, 1000);
        await token.transfer(user4.address, 1000);
        await token.transfer(user5.address, 1000);

        await token.connect(user1).approve(dao.address, 1000)
        await token.connect(user2).approve(dao.address, 1000)
        await token.connect(user3).approve(dao.address, 1000)
        await token.connect(user4).approve(dao.address, 1000)
        await token.connect(user5).approve(dao.address, 1000)
	      
	})

	describe('DAO', () => {
        describe('Proposal creation', () => {
            it('should create proposal', async () => {
                await expect(dao.createProposal(
                    recipient.address, 
                    ethers.utils.parseEther("10"), 
                    'proposal',  
                    86400,
                    {  value: ethers.utils.parseEther("10") }
                    ))
                    .to.emit(dao, 'ProposalCreated')
                    .withArgs(
                        0,
                        ethers.utils.parseEther("10"), 
                        recipient.address, 
                    )
            })

            it('should revert if the sent ether amount is less than proposal amount', async () => {
                await expect(dao.createProposal(
                    recipient.address, 
                    ethers.utils.parseEther("10"), 
                    'proposal',  
                    86400,
                    {  value: ethers.utils.parseEther("9") }
                    ))
                    .to
					.be.revertedWith("not enough ether")
            })

            it('should revert if the debating period is less than the minimum debating period', async () => {
                await expect(dao.createProposal(
                    recipient.address, 
                    ethers.utils.parseEther("10"), 
                    'proposal',  
                    86399,
                    {  value: ethers.utils.parseEther("10") }
                    ))
                    .to
					.be.revertedWith("too short debating period")
            })
        })

        describe('Vote', () => {
            beforeEach(async () => {
                await dao.createProposal(
                    recipient.address, 
                    ethers.utils.parseEther("10"), 
                    'proposal',  
                    86400,
                    {  value: ethers.utils.parseEther("10") }
                    )
                  
            })
            it('should vote for the proposal', async () => {
                await dao.connect(user1).deposit(100)
                await expect(dao.connect(user1).vote(
                    0, 
                    100
                    ))
                    .to.emit(dao, 'Voted')
                    .withArgs(
                        0,
                        100, 
                        user1.address, 
                    )
                    const proposal = await dao.proposals(0)   
                    expect(proposal.votes).to.equal(100)
            })

            it('should revert if user has not enough deposit', async () => {
                await dao.connect(user1).deposit(100)
                dao.connect(user1).vote(0, 100)
                
                await expect(dao.connect(user1).vote(
                    0, 
                    100
                    ))
                    .to
					.be.revertedWith("not enough deposit")
            })

            it('should revert if the vote is over', async () => {
                await dao.connect(user1).deposit(100)
                await network.provider.send("evm_increaseTime", [86401])
                await expect(dao.connect(user1).vote(
                    0, 
                    100
                    ))
                    .to
					.be.revertedWith("vote is over")
               
            })
        })

        describe('Unvote', () => {
            beforeEach(async () => {
                await dao.createProposal(
                    recipient.address, 
                    ethers.utils.parseEther("10"), 
                    'proposal',  
                    86400,
                    {  value: ethers.utils.parseEther("10") }
                    )
               const proposal = await dao.proposals(0)   
               expect(proposal.votes).to.equal(0)
            })
            it('should unvote for the proposal', async () => {
                await dao.connect(user1).deposit(100)
                dao.connect(user1).vote(0, 50)
                await expect(dao.connect(user1).unvote(
                    0
                  ))
                    .to.emit(dao, 'Unvoted')
                    .withArgs(
                        0,
                        50, 
                        user1.address, 
                    )
                const proposal = await dao.proposals(0)   
                expect(proposal.votes).to.equal(0)
            })

            it('should revert if user has not voted', async () => {
                await expect(dao.connect(user1).unvote(
                    0
                 ))
                    .to
					.be.revertedWith("has not voted")
            })

            it('should revert if the vote is over', async () => {
                await dao.connect(user1).deposit(100)
                await dao.connect(user1).vote(0, 100)
                await network.provider.send("evm_increaseTime", [86401])
                await expect(dao.connect(user1).unvote(
                    0, 
                    ))
                    .to
					.be.revertedWith("vote is over")     
            })
        })

        describe('Execute proposal', () => {
            beforeEach(async () => {
                await dao.createProposal(
                    recipient.address, 
                    ethers.utils.parseEther("10"), 
                    'proposal',  
                    86400,
                    {  value: ethers.utils.parseEther("10") }
                    )
                await dao.connect(user1).deposit(200)
                await dao.connect(user2).deposit(200)
                await dao.connect(user3).deposit(200)
                await dao.connect(user4).deposit(200)
                await dao.connect(user5).deposit(200)
            })
            it('should execute the proposal and send ether to the recipient of the quorum was reached', async () => {
                await dao.connect(user1).vote(0, 200)
                await dao.connect(user2).vote(0, 200)
                await dao.connect(user3).vote(0, 200)
                await dao.connect(user4).vote(0, 150)
                await dao.connect(user5).vote(0, 150)

                await network.provider.send("evm_increaseTime", [86401])

                const balanceBefore = new BigNumber (await web3.eth.getBalance(recipient.address));

                await expect(dao.executeProposal(
                    0
                  ))
                    .to.emit(dao, 'ProposalExecuted')
                    .withArgs(
                        0,
                        ethers.utils.parseEther("10"), 
                        recipient.address, 
                    )
                const balanceAfter = new BigNumber (await web3.eth.getBalance(recipient.address));
                expect(balanceAfter.minus(balanceBefore).toString()).to.equal(ethers.utils.parseEther("10").toString())
            })
           
        })
    })
})