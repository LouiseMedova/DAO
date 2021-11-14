// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import './Token.sol';

contract DAO is AccessControl, ReentrancyGuard{

    struct Proposal {
        address payable recipient;
        uint amount;
        string description;
        uint votingDeadline;
        uint votes;
        bool executed;
    }

    event ProposalCreated (
        uint id, 
        uint amount,
        address payable recipient
    );

    event Voted (
        uint id,
        uint amount,
        address voter
    );

    event Unvoted (
        uint id,
        uint amount,
        address voter
    );

    event ProposalExecuted (
        uint id, 
        uint amount,
        address payable recipient
    );

    bytes32 public constant MEMBER = keccak256("MEMBER");

    uint minDebatingPeriod;
    uint public totalDeposits;
    uint public nextProposalId;
    //threshold of voters (using 1 decimals: 1000 = 100)
    uint public quorum;
    address public tokenAddress;
    mapping(uint => Proposal) public proposals;
    mapping(address => uint) public deposits;
    mapping(address => bool) public members;
    mapping(address => mapping(uint => uint)) public hasVoted;

    constructor(
        uint _minDebatingPeriod,
        address _tokenAddress,
        uint _quorum
        ) {
        minDebatingPeriod = _minDebatingPeriod;
        tokenAddress = _tokenAddress;
        quorum = _quorum;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    ///@dev Deposits tokens to DAO
    ///@param _amount The amount of tokens
    function deposit(uint _amount) onlyRole(MEMBER) external {
        Token(tokenAddress).transferFrom(msg.sender, address(this), _amount);
        deposits[msg.sender] += _amount;
        totalDeposits += _amount;
    }

    /// @dev Admin creates a proposal to send `_amount` Wei to `_recipient`
    /// @param _recipient The recipient address 
    /// @param _amount The amount of wei to be sent 
    /// @param _description The proposal description
    /// @param _debatingPeriod The duration of debate
    function createProposal(
        address _recipient,
        uint _amount,
        string memory _description,
        uint _debatingPeriod
        ) onlyRole(DEFAULT_ADMIN_ROLE) payable external {
            require(_amount <= msg.value, 'not enough ether');
            require(_debatingPeriod >= minDebatingPeriod, 'too short debating period');
            proposals[nextProposalId] = Proposal(
                payable(_recipient),
                _amount,
                _description,
                block.timestamp + _debatingPeriod,
                0,
                false
            );
            emit ProposalCreated(
                nextProposalId, 
                _amount,
                payable(_recipient)
            );
            nextProposalId ++;
    }

    /// @dev Member votes on proposal `_id`
    /// @param _id The proposal ID
    /// @param _amount The amount of tokens the user deposits for votes
    function vote(uint _id, uint _amount) onlyRole(MEMBER) external {
        Proposal storage proposal = proposals[_id];
        require(_amount <= deposits[msg.sender] - hasVoted[msg.sender][_id], 'not enough deposit');
        require(block.timestamp < proposal.votingDeadline, 'vote is over');
        hasVoted[msg.sender][_id] += _amount;
        proposal.votes += _amount;
        emit Voted(
            _id,
            _amount,
            msg.sender
        );
    }

    /// @dev Member unvotes on proposal `_id`
    /// @param _id The proposal ID
    function unvote(uint _id) onlyRole(MEMBER) external {
        Proposal storage proposal = proposals[_id];
        require(hasVoted[msg.sender][_id] > 0, 'has not voted');
        require(block.timestamp < proposal.votingDeadline, 'vote is over');
        proposal.votes -= hasVoted[msg.sender][_id];
        emit Unvoted(
            _id,
            hasVoted[msg.sender][_id],
            msg.sender
        );
        hasVoted[msg.sender][_id] = 0;
    }

    /// @dev Admin checks whether proposal `_id` has the votes above the quorum
    /// and executes the proposal in the case the quorum has been achieved
    /// @param _id The proposal ID
    function executeProposal(uint _id) nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) external {
        Proposal storage proposal = proposals[_id];
        require(block.timestamp >= proposal.votingDeadline, 'vote is not over');
        require(proposal.executed == false, 'already executed');
        require(((proposal.votes * 1000) / totalDeposits) >= quorum, 'quorum was not achieved');
        proposal.executed = true;
        (bool sent, ) = proposal.recipient.call{value: proposal.amount}("");
        require(sent, "Failed to send Ether");
        emit ProposalExecuted(
            _id,
            proposal.amount,
            proposal.recipient
        );
    }
}