# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# =============================================================================
#  brandguard.py — Decentralized Marketing Escrow for Influencers
#  GenLayer Intelligent Contract (v0.2.16)
# =============================================================================

from genlayer import *
import json
from datetime import datetime, timezone

class Contract(gl.Contract):
    """
    BrandGuard — Decentralized AI-Managed Sponsorship Escrow
    ========================================================
    Holds sponsor funds in escrow, automatically evaluates influencer posts
    against qualitative guidelines and banned words lists, and executes
    payments or rejection reviews on-chain.
    """

    # Monotonic campaign counter
    campaigns_count:           u64

    # Campaign state fields
    campaign_brand:            TreeMap[u64, Address]
    campaign_influencer:       TreeMap[u64, Address]
    campaign_payout_amount:    TreeMap[u64, u256]
    campaign_rules:            TreeMap[u64, str]      # qualitative rules
    campaign_banned_words:     TreeMap[u64, str]      # comma-separated words
    campaign_submission_url:   TreeMap[u64, str]      # URL of influencer post
    campaign_status:           TreeMap[u64, str]      # "ACTIVE", "SUBMITTED", "RELEASED", "REJECTED", "CANCELLED"
    campaign_verdict_reason:   TreeMap[u64, str]      # AI Brand Manager review

    # ═══════════════════════════════════════════════════════════════════
    # CONSTRUCTOR
    # ═══════════════════════════════════════════════════════════════════
    def __init__(self) -> None:
        """
        Constructor. Standard GenLayer initialization rules.
        """
        self.campaigns_count = 0

    # ═══════════════════════════════════════════════════════════════════
    # PUBLIC METHOD: CREATE SPONSORSHIP CAMPAIGN
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.write
    def create_campaign(self, influencer: Address, rules: str, banned_words: str) -> int:
        """
        Brands call this to create a marketing campaign, lock sponsorship reward money,
        and write guidelines.
        """
        if len(rules.strip()) == 0:
            raise UserError("Guidelines/rules cannot be empty.")
            
        payout_val = int(gl.message.value)
        if payout_val <= 0:
            raise UserError("You must deposit a positive GEN payout amount.")
            
        cid = self.campaigns_count
        
        self.campaign_brand[cid]            = gl.message.sender_account
        self.campaign_influencer[cid]       = influencer
        self.campaign_payout_amount[cid]    = payout_val
        self.campaign_rules[cid]            = rules.strip()
        self.campaign_banned_words[cid]     = banned_words.strip()
        self.campaign_submission_url[cid]   = ""
        self.campaign_status[cid]           = "ACTIVE"
        self.campaign_verdict_reason[cid]   = "Awaiting influencer post URL submission."
        
        self.campaigns_count = int(cid) + 1
        return int(cid)

    # ═══════════════════════════════════════════════════════════════════
    # PUBLIC METHOD: INFLUENCER SUBMITS URL
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.write
    def submit_content(self, campaign_id: int, url: str) -> None:
        """
        Influencers call this to submit their finished PR post URL for review.
        """
        if campaign_id < 0 or campaign_id >= int(self.campaigns_count):
            raise UserError("Campaign does not exist.")
            
        status = self.campaign_status.get(campaign_id, "ACTIVE")
        if status not in ["ACTIVE", "REJECTED"]:
            raise UserError("Campaign is not active or editable.")
            
        if len(url.strip()) == 0:
            raise UserError("Submission URL cannot be empty.")
            
        registered_influencer = self.campaign_influencer.get(campaign_id, gl.message.sender_account)
        if gl.message.sender_account != registered_influencer:
            raise UserError("Only the registered influencer can submit content.")
            
        self.campaign_submission_url[campaign_id] = url.strip()
        self.campaign_status[campaign_id]         = "SUBMITTED"
        self.campaign_verdict_reason[campaign_id] = "URL submitted. Awaiting AI evaluation."

    # ═══════════════════════════════════════════════════════════════════
    # PUBLIC METHOD: BRAND CANCELS AND WITHDRAWS ESCROW
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.write
    def cancel_campaign(self, campaign_id: int) -> None:
        """
        Allows the brand to cancel the campaign and withdraw locked funds
        if it is in ACTIVE or REJECTED states.
        """
        if campaign_id < 0 or campaign_id >= int(self.campaigns_count):
            raise UserError("Campaign does not exist.")
            
        status = self.campaign_status.get(campaign_id, "ACTIVE")
        if status not in ["ACTIVE", "REJECTED"]:
            raise UserError("Escrow cannot be cancelled in its current state.")
            
        brand = self.campaign_brand.get(campaign_id, gl.message.sender_account)
        if gl.message.sender_account != brand:
            raise UserError("Only the brand can cancel this sponsorship.")
            
        payout_val = int(self.campaign_payout_amount.get(campaign_id, 0))
        if payout_val <= 0:
            raise UserError("No funds locked.")
            
        self.campaign_payout_amount[campaign_id] = 0
        self.campaign_status[campaign_id]         = "CANCELLED"
        self.campaign_verdict_reason[campaign_id] = "Sponsorship cancelled by sponsor. Escrow refunded."
        
        other = gl.get_contract_at(brand)
        other.emit_transfer(value=u256(payout_val))

    # ═══════════════════════════════════════════════════════════════════
    # PUBLIC METHOD: EVALUATE INFLUENCER SUBMISSION (AI ESCROW DECISION)
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.write
    def evaluate_submission(self, campaign_id: int) -> None:
        """
        Runs the non-deterministic AI Brand Manager evaluation process to approve or reject.
        """
        if campaign_id < 0 or campaign_id >= int(self.campaigns_count):
            raise UserError("Campaign does not exist.")
            
        if self.campaign_status.get(campaign_id, "ACTIVE") != "SUBMITTED":
            raise UserError("No active submission waiting for review.")
            
        url          = self.campaign_submission_url.get(campaign_id, "")
        rules        = self.campaign_rules.get(campaign_id, "")
        banned_words = self.campaign_banned_words.get(campaign_id, "")
        
        # ── Non-Deterministic Evaluation Logic (Rule 7) ───────────────
        def leader_fn() -> str:
            # Fetch URL using gl.nondet.web.render
            try:
                page_text: str = gl.nondet.web.render(url)
            except Exception as render_err:
                return json.dumps({
                    "error": f"URL_FETCH_FAILED: {str(render_err)}",
                    "verdict": "REJECT",
                    "reason": f"AI Brand Manager could not access the URL page: {str(render_err)}"
                })
                
            content = page_text.strip()
            if len(content) < 50:
                return json.dumps({
                    "error": "CONTENT_TOO_SHORT",
                    "verdict": "REJECT",
                    "reason": "The submitted URL returned insufficient text content for qualitative review."
                })
                
            truncated_content = content[:5000]
            
            # Compile qualitative manager prompt
            prompt = f"""You are the AI Brand Manager for a marketing escrow smart contract.
Your job is to read an influencer's published content and determine if it meets the brand's qualitative rules and guidelines.

Guidelines to follow:
"{rules}"

Banned words to avoid (comma-separated list):
"{banned_words}"

Influencer's post content (extracted text):
--- CONTENT START ---
{truncated_content}
--- CONTENT END ---

Please evaluate the post based on:
1. GUIDELINES COMPLIANCE: Does the post follow the brand's requirements (e.g. natural tone, product mentions, enthusiastic vibe)?
2. BANNED WORDS: Does the post contain any of the listed banned words? (Check case-insensitively).

Make a decision:
- "RELEASE": The content successfully follows the guidelines and does NOT contain any banned words.
- "REJECT": The content fails to meet the guidelines, is low quality, or contains banned words.

OUTPUT FORMAT:
Respond ONLY with a valid JSON object matching this schema. No markdown wrapping, no extra words.
{{
  "verdict": "RELEASE" | "REJECT",
  "reason": "<A 2-3 sentence qualitative analysis detailing why it was approved or rejected>"
}}"""

            # Execute LLM evaluation
            raw_output = gl.nondet.exec_prompt(prompt)
            
            # Clean markdown code block decorators if present
            cleaned = raw_output.strip()
            if cleaned.startswith("```"):
                lines = cleaned.split("\n")
                inner_lines = []
                for line in lines[1:]:
                    if line.strip() == "```":
                        break
                    inner_lines.append(line)
                cleaned = "\n".join(inner_lines).strip()
                
            try:
                parsed = json.loads(cleaned)
                verdict = str(parsed.get("verdict", "REJECT")).strip().upper()
                if verdict not in ["RELEASE", "REJECT"]:
                    verdict = "REJECT"
                reason = str(parsed.get("reason", "AI Brand Manager completed review.")).strip()
                
                return json.dumps({
                    "verdict": verdict,
                    "reason": reason[:1000]
                })
            except Exception as parse_err:
                return json.dumps({
                    "error": f"JSON_PARSE_FAILED: {str(parse_err)}",
                    "verdict": "REJECT",
                    "reason": "AI Brand Manager response formatting error. Rejected by default."
                })
                
        def validator_fn(leader_result: str) -> bool:
            """
            Consensus mechanism logic. Compares the logical output verdict (RELEASE/REJECT)
            across all validator nodes to verify consensus.
            """
            try:
                leader_data = json.loads(leader_result)
            except Exception:
                return False
                
            if "error" in leader_data:
                allowed_errors = {"URL_FETCH_FAILED", "CONTENT_TOO_SHORT", "JSON_PARSE_FAILED"}
                return any(err in str(leader_data.get("error", "")) for err in allowed_errors)
                
            validator_raw = leader_fn()
            try:
                validator_data = json.loads(validator_raw)
            except Exception:
                return True  # Abstain (agree) if validator node faces a local error
                
            if "error" in validator_data:
                return True  # Abstain if validator gets network error
                
            leader_verdict = str(leader_data.get("verdict", "")).strip().upper()
            validator_verdict = str(validator_data.get("verdict", "")).strip().upper()
            
            # Semantic agreement check
            return leader_verdict == validator_verdict

        # Run Consensus Protocol
        consensus_json = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        
        try:
            res = json.loads(consensus_json)
        except Exception:
            self.campaign_status[campaign_id]         = "REJECTED"
            self.campaign_verdict_reason[campaign_id] = "AI consensus failed due to unparseable results."
            return
            
        verdict = str(res.get("verdict", "REJECT")).strip().upper()
        reason = str(res.get("reason", "AI Brand Manager evaluation completed."))
        
        self.campaign_verdict_reason[campaign_id] = reason
        
        if verdict == "RELEASE":
            payout_val = int(self.campaign_payout_amount.get(campaign_id, 0))
            influencer = self.campaign_influencer.get(campaign_id, gl.message.sender_account)
            
            self.campaign_payout_amount[campaign_id] = 0
            self.campaign_status[campaign_id]         = "RELEASED"
            
            # Transfer locked sponsorship payout to influencer
            other = gl.get_contract_at(influencer)
            other.emit_transfer(value=u256(payout_val))
        else:
            self.campaign_status[campaign_id] = "REJECTED"

    # ═══════════════════════════════════════════════════════════════════
    # READ-ONLY VIEW METHODS
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.view
    def get_campaign_count(self) -> int:
        """
        Returns the total number of campaigns created.
        """
        return int(self.campaigns_count)
        
    @gl.public.view
    def get_campaign(self, campaign_id: int) -> str:
        """
        Returns a JSON-serialized representation of a campaign.
        """
        if campaign_id < 0 or campaign_id >= int(self.campaigns_count):
            raise UserError("Campaign does not exist.")
            
        brand = self.campaign_brand.get(campaign_id, gl.message.sender_account)
        influencer = self.campaign_influencer.get(campaign_id, gl.message.sender_account)
        
        return json.dumps({
            "id": campaign_id,
            "brand": str(brand),
            "influencer": str(influencer),
            "payout_amount": int(self.campaign_payout_amount.get(campaign_id, 0)),
            "rules": self.campaign_rules.get(campaign_id, ""),
            "banned_words": self.campaign_banned_words.get(campaign_id, ""),
            "submission_url": self.campaign_submission_url.get(campaign_id, ""),
            "status": self.campaign_status.get(campaign_id, "ACTIVE"),
            "verdict_reason": self.campaign_verdict_reason.get(campaign_id, "")
        })
