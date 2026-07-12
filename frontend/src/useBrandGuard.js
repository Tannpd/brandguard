import { useState, useCallback, useEffect } from 'react';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '';

let _readClient = null;

function getReadClient() {
  if (!_readClient) {
    _readClient = createClient({ chain: studionet });
  }
  return _readClient;
}

function getWriteClient(account) {
  if (typeof account === 'string') {
    return createClient({
      chain: studionet,
      account,
      provider: window.ethereum,
    });
  }
  return createClient({ chain: studionet, account });
}

// Convert Wei (u256) to human readable GEN string
export function formatGen(weiVal) {
  if (!weiVal) return '0';
  try {
    const big = BigInt(weiVal);
    const integerPart = big / 10n**18n;
    const fractionalPart = big % 10n**18n;
    let fractionStr = fractionalPart.toString().padStart(18, '0');
    fractionStr = fractionStr.replace(/0+$/, ''); // Trim trailing zeros
    if (fractionStr === '') {
      return integerPart.toString();
    }
    return `${integerPart}.${fractionStr.slice(0, 4)}`;
  } catch (e) {
    return '0';
  }
}

// Convert human readable GEN input to Wei (u256 BigInt)
export function parseGen(genVal) {
  if (!genVal || genVal.toString().trim() === '') return 0n;
  try {
    const parts = genVal.toString().split('.');
    let integerPart = parts[0] || '0';
    let fractionalPart = parts[1] || '';
    fractionalPart = fractionalPart.slice(0, 18).padEnd(18, '0');
    return BigInt(integerPart) * 10n**18n + BigInt(fractionalPart);
  } catch (e) {
    return 0n;
  }
}

export function useBrandGuard() {
  const [address, setAddress] = useState('');
  const [glAccount, setGlAccount] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [txStatus, setTxStatus] = useState('');

  // Connect Wallet (MetaMask or fallback ephemeral account)
  const connectWallet = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      if (typeof window !== 'undefined' && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          const addr = accounts[0].toLowerCase();
          
          // Test snap connection. If it fails, fallback to Demo Wallet.
          const client = getWriteClient(addr);
          await client.connect();

          setAddress(addr);
          setGlAccount(addr);
          return; // Success
        } catch (walletErr) {
          console.warn('MetaMask Snap not supported or connection failed, using Demo Wallet:', walletErr);
        }
      }

      // Ephemeral account fallback
      let savedKey = localStorage.getItem('__brandguard_sk');
      let acct;
      if (savedKey) {
        acct = createAccount(savedKey);
      } else {
        acct = createAccount();
        localStorage.setItem('__brandguard_sk', acct.privateKey);
      }
      const addr = acct.address.toLowerCase();
      setAddress(addr);
      setGlAccount(acct);
    } catch (err) {
      console.error('Wallet connection failed:', err);
      setError('Wallet connection failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch all campaigns from contract
  const fetchCampaigns = useCallback(async () => {
    if (!CONTRACT_ADDRESS) return;
    setLoading(true);
    try {
      const client = getReadClient();
      const countStr = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_campaign_count',
        args: [],
      });
      
      const count = parseInt(countStr || '0', 10);
      const list = [];
      
      for (let i = 0; i < count; i++) {
        const rawDetails = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: 'get_campaign',
          args: [i],
        });
        const details = JSON.parse(rawDetails);
        list.push(details);
      }
      
      setCampaigns(list.reverse()); // Show newest first
      setError('');
    } catch (err) {
      console.error('Error fetching campaigns:', err);
      setError('Fetch campaigns failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create Campaign (Brand Locks Payout)
  const createCampaign = async (influencerAddress, rules, bannedWords, payoutAmountGen) => {
    if (!glAccount || !CONTRACT_ADDRESS) {
      throw new Error('Wallet not connected or contract address is missing');
    }
    setLoading(true);
    setError('');
    setTxHash('');
    setTxStatus('Creating campaign and locking sponsor escrow funds...');

    try {
      const client = getWriteClient(glAccount);
      const valueWei = parseGen(payoutAmountGen);
      
      if (typeof glAccount === 'string') {
        await client.connect();
      }

      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'create_campaign',
        args: [
          influencerAddress.trim(),
          rules.trim(),
          bannedWords.trim()
        ],
        value: valueWei,
      });
      
      setTxHash(hash);
      setTxStatus('Escrow transaction broadcasted. Awaiting block inclusion...');

      const receipt = await client.waitForTransactionReceipt({ hash });
      
      const leaderReceipt = receipt.consensus_data?.leader_receipt?.[0];
      if (leaderReceipt && leaderReceipt.execution_result === 'ERROR') {
        const errorMsg = leaderReceipt.genvm_result?.stderr || 'Contract execution error';
        throw new Error(errorMsg);
      }

      setTxStatus('Success! Escrow Campaign created.');
      await fetchCampaigns();
      return receipt;
    } catch (err) {
      console.error('Campaign creation failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('Failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Submit Content URL (Influencer)
  const submitContent = async (campaignId, url) => {
    if (!glAccount || !CONTRACT_ADDRESS) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError('');
    setTxHash('');
    setTxStatus('Submitting published PR post link to escrow...');

    try {
      const client = getWriteClient(glAccount);
      
      if (typeof glAccount === 'string') {
        await client.connect();
      }

      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'submit_content',
        args: [parseInt(campaignId, 10), url.trim()],
      });
      
      setTxHash(hash);
      setTxStatus('Submission broadcasted. Awaiting block finalization...');

      const receipt = await client.waitForTransactionReceipt({ hash });
      
      const leaderReceipt = receipt.consensus_data?.leader_receipt?.[0];
      if (leaderReceipt && leaderReceipt.execution_result === 'ERROR') {
        const errorMsg = leaderReceipt.genvm_result?.stderr || 'Contract execution error';
        throw new Error(errorMsg);
      }

      setTxStatus('Content submitted successfully!');
      await fetchCampaigns();
      return receipt;
    } catch (err) {
      console.error('Submission failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('Failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Cancel Campaign and Refund Sponsor (Brand)
  const cancelCampaign = async (campaignId) => {
    if (!glAccount || !CONTRACT_ADDRESS) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError('');
    setTxHash('');
    setTxStatus('Cancelling campaign and returning locked funds...');

    try {
      const client = getWriteClient(glAccount);
      
      if (typeof glAccount === 'string') {
        await client.connect();
      }

      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'cancel_campaign',
        args: [parseInt(campaignId, 10)],
      });
      
      setTxHash(hash);
      setTxStatus('Cancellation broadcasted. Refunding sponsor...');

      const receipt = await client.waitForTransactionReceipt({ hash });
      
      const leaderReceipt = receipt.consensus_data?.leader_receipt?.[0];
      if (leaderReceipt && leaderReceipt.execution_result === 'ERROR') {
        const errorMsg = leaderReceipt.genvm_result?.stderr || 'Escrow cancellation error';
        throw new Error(errorMsg);
      }

      setTxStatus('Campaign cancelled. Sponsorship money refunded.');
      await fetchCampaigns();
      return receipt;
    } catch (err) {
      console.error('Cancellation failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('Failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Evaluate Submission (Runs AI fact-checking/consensus validation)
  const evaluateSubmission = async (campaignId) => {
    if (!glAccount || !CONTRACT_ADDRESS) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError('');
    setTxHash('');
    setTxStatus('Calling AI Brand Manager to audit content...');

    try {
      const client = getWriteClient(glAccount);
      
      if (typeof glAccount === 'string') {
        await client.connect();
      }

      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'evaluate_submission',
        args: [parseInt(campaignId, 10)],
      });
      
      setTxHash(hash);
      setTxStatus('AI nodes are fetching post content and checking rules. Reaching consensus...');

      const receipt = await client.waitForTransactionReceipt({ hash });
      
      const leaderReceipt = receipt.consensus_data?.leader_receipt?.[0];
      if (leaderReceipt && leaderReceipt.execution_result === 'ERROR') {
        const errorMsg = leaderReceipt.genvm_result?.stderr || 'AI evaluation error';
        throw new Error(errorMsg);
      }

      setTxStatus('AI review finished! consensus achieved.');
      await fetchCampaigns();
      return receipt;
    } catch (err) {
      console.error('Evaluation failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('Failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (CONTRACT_ADDRESS) {
      fetchCampaigns();
    }
  }, [CONTRACT_ADDRESS, address, fetchCampaigns]);

  return {
    address,
    campaigns,
    loading,
    error,
    txHash,
    txStatus,
    connectWallet,
    fetchCampaigns,
    createCampaign,
    submitContent,
    cancelCampaign,
    evaluateSubmission,
    contractAddress: CONTRACT_ADDRESS,
  };
}
