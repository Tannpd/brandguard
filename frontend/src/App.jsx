import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Coins, 
  Plus, 
  ExternalLink, 
  RefreshCw, 
  User, 
  Clock, 
  Sparkles, 
  CheckCircle, 
  XCircle, 
  Info,
  Award,
  AlertTriangle,
  Send,
  VolumeX,
  FileText
} from 'lucide-react';
import { useBrandGuard, formatGen } from './useBrandGuard';

export default function App() {
  const {
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
    contractAddress
  } = useBrandGuard();

  // Tab Filtering: 'all', 'active', 'submitted', 'released', 'rejected', 'cancelled'
  const [activeTab, setActiveTab] = useState('all');
  
  // Create Campaign Form State
  const [influencerAddress, setInfluencerAddress] = useState('');
  const [rules, setRules] = useState('');
  const [bannedWords, setBannedWords] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('5');
  const [formError, setFormError] = useState('');

  // Submission input states: campaignId -> url
  const [subUrls, setSubUrls] = useState({});

  const handleSubUrlChange = (cid, val) => {
    setSubUrls(prev => ({
      ...prev,
      [cid]: val
    }));
  };

  const truncateAddr = (addr) => {
    if (!addr) return '';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    setFormError('');

    if (influencerAddress.trim() === '') {
      setFormError('Influencer wallet address is required.');
      return;
    }

    if (rules.trim() === '') {
      setFormError('Sponsorship qualitative guidelines cannot be empty.');
      return;
    }

    const reward = parseFloat(payoutAmount);
    if (isNaN(reward) || reward <= 0) {
      setFormError('Please enter a valid positive GEN escrow amount.');
      return;
    }

    try {
      await createCampaign(influencerAddress, rules, bannedWords, payoutAmount);
      // Reset form
      setInfluencerAddress('');
      setRules('');
      setBannedWords('');
      setPayoutAmount('5');
    } catch (err) {
      // Handled in custom hook
    }
  };

  // Filter campaigns
  const filteredCampaigns = campaigns.filter(c => {
    if (activeTab === 'active') return c.status === 'ACTIVE';
    if (activeTab === 'submitted') return c.status === 'SUBMITTED';
    if (activeTab === 'released') return c.status === 'RELEASED';
    if (activeTab === 'rejected') return c.status === 'REJECTED';
    if (activeTab === 'cancelled') return c.status === 'CANCELLED';
    return true; // 'all'
  });

  // Calculate statistics
  const totalVolumeWei = campaigns.reduce((acc, cur) => acc + BigInt(cur.payout_amount || 0), 0n);
  const activeEscrowWei = campaigns.reduce((acc, cur) => {
    if (cur.status === 'ACTIVE' || cur.status === 'SUBMITTED' || cur.status === 'REJECTED') {
      return acc + BigInt(cur.payout_amount || 0);
    }
    return acc;
  }, 0n);

  return (
    <div className="app-container">
      {/* HEADER SECTION */}
      <header className="app-header glass-panel">
        <div className="brand">
          <div className="brand-logo">🛡️</div>
          <div>
            <h1 className="brand-name">BrandGuard</h1>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Decentralized Influencer Escrow</p>
          </div>
        </div>
        
        <div className="wallet-section">
          {address ? (
            <>
              <div className="network-badge">
                <span className="network-dot"></span>
                <span>GenLayer Studio</span>
              </div>
              <div className="network-badge" style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderColor: 'var(--border-color)' }}>
                <User size={14} style={{ color: 'var(--text-secondary)' }} />
                <span style={{ color: 'var(--text-primary)' }}>{truncateAddr(address)}</span>
              </div>
            </>
          ) : (
            <button className="btn btn-wallet" onClick={connectWallet} disabled={loading}>
              <Coins size={16} />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      </header>

      {/* ERROR BANNER */}
      {error && (
        <div className="glass-panel" style={{ borderLeft: '4px solid var(--accent-rose)', padding: '16px 20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <AlertTriangle style={{ color: 'var(--accent-rose)' }} />
          <div>
            <p style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Sponsorship System Alert</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{error}</p>
          </div>
        </div>
      )}

      {/* MAIN LAYOUT GRID */}
      <div className="dashboard-grid">
        
        {/* SIDEBAR COL */}
        <div className="sidebar-col">
          
          {/* STATS CARD */}
          <div className="glass-panel info-card">
            <h2 className="section-title">
              <Coins size={18} style={{ color: 'var(--accent-gold)' }} />
              <span>Escrow Registry</span>
            </h2>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Total Escrows</span>
                <span className="stat-value highlight">{campaigns.length}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Active Escrow Vol</span>
                <span className="stat-value" style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '700' }}>
                  {formatGen(activeEscrowWei)} GEN
                </span>
              </div>
            </div>
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <div className="stat-item">
                <span className="stat-label">Total Volume Locked (Historical)</span>
                <span className="stat-value" style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                  {formatGen(totalVolumeWei)} GEN
                </span>
              </div>
            </div>
          </div>

          {/* CREATE CAMPAIGN ESCROW CARD */}
          <div className="glass-panel info-card">
            <h2 className="section-title">
              <Plus size={18} style={{ color: 'var(--accent-gold)' }} />
              <span>Deploy Sponsorship Escrow</span>
            </h2>
            
            <form onSubmit={handleCreateCampaign}>
              <div className="form-group">
                <label className="form-label">Influencer Wallet Address</label>
                <input 
                  type="text"
                  className="input-text"
                  placeholder="0x..."
                  value={influencerAddress}
                  onChange={(e) => setInfluencerAddress(e.target.value)}
                  disabled={loading || !address}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Escrow Payout Amount (GEN)</label>
                <input 
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input-text"
                  placeholder="5"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  disabled={loading || !address}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Qualitative Guidelines (Rules)</label>
                <textarea 
                  className="input-text input-textarea"
                  placeholder="e.g. Must sound natural and enthusiastic. Explicitly mention the new flavor launch, and explain why it tastes delicious."
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  disabled={loading || !address}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Banned Words (Comma-separated)</label>
                <input 
                  type="text"
                  className="input-text"
                  placeholder="e.g. cheap, bargain, advertisement, sponsor"
                  value={bannedWords}
                  onChange={(e) => setBannedWords(e.target.value)}
                  disabled={loading || !address}
                />
              </div>

              {formError && (
                <p style={{ color: 'var(--accent-rose)', fontSize: '13px', marginBottom: '16px', fontWeight: '500' }}>
                  {formError}
                </p>
              )}

              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={loading || !address}
              >
                <ShieldCheck size={16} />
                <span>Lock Payout Escrow</span>
              </button>
            </form>
          </div>

        </div>

        {/* CONTENT COL */}
        <div className="content-col">
          
          {/* TABS FILTER BAR */}
          <div className="glass-panel filter-bar">
            <div className="tabs">
              <button className={`tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All Escrows</button>
              <button className={`tab ${activeTab === 'active' ? 'active' : ''}`} onClick={() => setActiveTab('active')}>Active</button>
              <button className={`tab ${activeTab === 'submitted' ? 'active' : ''}`} onClick={() => setActiveTab('submitted')}>Submitted</button>
              <button className={`tab ${activeTab === 'released' ? 'active' : ''}`} onClick={() => setActiveTab('released')}>Released</button>
              <button className={`tab ${activeTab === 'rejected' ? 'active' : ''}`} onClick={() => setActiveTab('rejected')}>Rejected</button>
            </div>
            
            <button className="btn btn-action" onClick={fetchCampaigns} disabled={loading} style={{ width: 'auto' }}>
              <RefreshCw size={14} className={loading ? 'animate-spin-slow' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {/* CAMPAIGN LIST */}
          {filteredCampaigns.length === 0 ? (
            <div className="glass-panel empty-state">
              <FileText />
              <p style={{ fontWeight: '600' }}>No sponsorships found</p>
              <p style={{ fontSize: '13px' }}>Create an escrow campaign on the left panel or check another filter.</p>
            </div>
          ) : (
            <div className="campaigns-list">
              {filteredCampaigns.map(campaign => {
                const isBrand = address && campaign.brand.toLowerCase() === address.toLowerCase();
                const isInfluencer = address && campaign.influencer.toLowerCase() === address.toLowerCase();
                
                return (
                  <div key={campaign.id} className={`glass-panel campaign-card status-${campaign.status.toLowerCase()}`}>
                    
                    {/* Header */}
                    <div className="campaign-header">
                      <span className="campaign-id">Escrow ID #{campaign.id}</span>
                      <span className={`status-badge ${campaign.status.toLowerCase()}`}>
                        {campaign.status}
                      </span>
                    </div>

                    {/* Sponsorship Locked Reward */}
                    <div className="payout-lock">
                      <Coins size={22} />
                      <span>{formatGen(campaign.payout_amount)} GEN locked</span>
                    </div>

                    {/* Metadata Details */}
                    <div className="campaign-details-grid">
                      <div className="detail-item">
                        <span className="detail-label">Brand / Sponsor</span>
                        <span className="detail-value">{campaign.brand}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Influencer</span>
                        <span className="detail-value">{campaign.influencer}</span>
                      </div>
                      {campaign.submission_url && (
                        <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                          <span className="detail-label">Influencer Submitted Post URL</span>
                          <a 
                            href={campaign.submission_url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="detail-value" 
                            style={{ color: 'var(--accent-blue)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                          >
                            <span>{campaign.submission_url}</span>
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Guidelines Rules Box */}
                    <div className="rules-box">
                      <p style={{ marginBottom: '6px' }}>
                        <strong>Sponsorship Guidelines:</strong>
                      </p>
                      <p style={{ fontStyle: 'italic', marginBottom: '8px' }}>"{campaign.rules}"</p>
                      {campaign.banned_words && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                          <VolumeX size={14} style={{ color: 'var(--accent-rose)' }} />
                          <span style={{ fontSize: '12px' }}>
                            <strong>Banned Words:</strong> <span style={{ color: 'var(--accent-rose)' }}>{campaign.banned_words}</span>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* AI Critique Box */}
                    {(campaign.status === 'RELEASED' || campaign.status === 'REJECTED') && (
                      <div className="ai-review">
                        <span className="ai-review-header">
                          <Sparkles size={14} />
                          <span>AI Brand Manager Critique</span>
                        </span>
                        <p className="ai-review-text">"{campaign.verdict_reason}"</p>
                      </div>
                    )}

                    {/* Interactive Action Boxes */}
                    <div className="action-box">
                      
                      {/* Influencer Submission Box */}
                      {isInfluencer && (campaign.status === 'ACTIVE' || campaign.status === 'REJECTED') && (
                        <div className="action-box">
                          <label className="form-label" style={{ color: 'var(--accent-blue)' }}>Influencer Dashboard: Submit PR Post Link</label>
                          <div className="submission-input-row">
                            <input 
                              type="url"
                              className="input-text"
                              placeholder="https://myblog.com/post-about-brand"
                              value={subUrls[campaign.id] || ''}
                              onChange={(e) => handleSubUrlChange(campaign.id, e.target.value)}
                              disabled={loading}
                            />
                            <button 
                              className="btn btn-influencer"
                              onClick={() => submitContent(campaign.id, subUrls[campaign.id])}
                              disabled={loading || !subUrls[campaign.id]}
                            >
                              <Send size={14} />
                              <span>Submit</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Brand Cancel Box */}
                      {isBrand && (campaign.status === 'ACTIVE' || campaign.status === 'REJECTED') && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            className="btn btn-cancel"
                            onClick={() => cancelCampaign(campaign.id)}
                            disabled={loading}
                          >
                            <XCircle size={14} />
                            <span>Cancel Escrow & Refund</span>
                          </button>
                        </div>
                      )}

                      {/* Review triggers (For anyone if SUBMITTED) */}
                      {campaign.status === 'SUBMITTED' && (
                        <div>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'center' }}>
                            Post URL has been submitted. Click to execute the AI qualitative review audit.
                          </p>
                          <button 
                            className="btn btn-primary"
                            onClick={() => evaluateSubmission(campaign.id)}
                            disabled={loading || !address}
                          >
                            <Sparkles size={14} />
                            <span>Run AI Brand Manager Audit</span>
                          </button>
                        </div>
                      )}

                    </div>

                  </div>
                );
              })}
            </div>
          )}

        </div>

      </div>

      {/* TX STATUS NOTIFICATION */}
      {txHash && (
        <div className="glass-panel tx-status-card" style={{ position: 'fixed', bottom: '24px', right: '24px', maxWidth: '380px', zIndex: 1000, borderLeft: '4px solid var(--accent-gold)' }}>
          <div className="tx-status-title">
            <RefreshCw size={14} className="animate-spin-slow" />
            <span>GenLayer Escrow Tx Status</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{txStatus}</p>
          <a 
            href={`https://studio.genlayer.com/tx/${txHash}`} 
            target="_blank" 
            rel="noreferrer" 
            className="tx-hash-link"
          >
            Tx: {txHash}
          </a>
        </div>
      )}
    </div>
  );
}
