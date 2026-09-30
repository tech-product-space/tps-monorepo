const { QuizQuestion } = require("../models");

const productManagementAdvancedQuestions = [
  {
    question: "What is the primary purpose of a product roadmap?",
    options: ["To define marketing budgets", "To communicate product vision, priorities, and timing at a high level", "To describe detailed engineering tasks", "To track sprint velocity"],
    answer: "To communicate product vision, priorities, and timing at a high level",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "roadmapping",
  },
  {
    question: "In product discovery, which activity best validates problem-solution fit early?",
    options: ["Code-first prototypes", "Customer interviews and problem validation", "Full PRD creation", "Launching an MVP without research"],
    answer: "Customer interviews and problem validation",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "discovery",
  },
  {
    question: "What does RICE stand for in prioritization?",
    options: ["Reach, Impact, Confidence, Effort", "Reach, Importance, Confidence, Effort", "Revenue, Impact, Confidence, Effort", "Reach, Impact, Cost, Effort"],
    answer: "Reach, Impact, Confidence, Effort",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "prioritization",
  },
  {
    question: "Which metric best measures activation in a consumer app?",
    options: ["Time to first key action completed", "DAU/MAU", "NPS", "ARPU"],
    answer: "Time to first key action completed",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "metrics",
  },
  {
    question: "The best definition of the North Star Metric (NSM) is:",
    options: ["The metric with the highest number", "A single metric that best captures the product's delivered value to users", "A revenue metric only", "An internal engineering productivity measure"],
    answer: "A single metric that best captures the product's delivered value to users",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "metrics",
  },
  {
    question: "In JTBD (Jobs to be Done), a 'job' is best described as:",
    options: ["The user's demographic profile", "The outcome users are trying to achieve in a given context", "The feature request backlog", "The team's sprint goal"],
    answer: "The outcome users are trying to achieve in a given context",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "frameworks",
  },
  {
    question: "What is a key benefit of story mapping?",
    options: ["Tracks budgets for each feature", "Visualizes user workflows and slices releases by value", "Calculates CAC", "Defines OKRs automatically"],
    answer: "Visualizes user workflows and slices releases by value",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "planning",
  },
  {
    question: "When is it most effective to use an A/B test?",
    options: ["When traffic is too low", "When measuring causal impact of a UI or policy change", "When only qualitative insights are required", "When releasing a breaking change to all users"],
    answer: "When measuring causal impact of a UI or policy change",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "experimentation",
  },
  {
    question: "Which best differentiates product metrics that are leading vs. lagging?",
    options: ["Leading predict future outcomes; lagging confirm results already realized", "Leading are financial; lagging are behavioral", "Leading are qualitative; lagging are quantitative", "Leading are collected monthly; lagging are daily"],
    answer: "Leading predict future outcomes; lagging confirm results already realized",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "metrics",
  },
  {
    question: "Which is the most appropriate use of the Kano model?",
    options: ["Prioritize tasks by urgency", "Categorize features into basic, performance, and delight to inform prioritization", "Optimize marketing attribution", "Create sprint capacity plans"],
    answer: "Categorize features into basic, performance, and delight to inform prioritization",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "frameworks",
  },
  {
    question: "What is the main goal of user interviews?",
    options: ["Validate hypotheses and uncover unmet needs qualitatively", "Increase sample size", "Measure statistical significance", "Replace analytics"],
    answer: "Validate hypotheses and uncover unmet needs qualitatively",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "research",
  },
  {
    question: "Which artifact most clearly connects strategy to execution?",
    options: ["OKRs", "Personas", "Press release/FAQ", "Story points"],
    answer: "OKRs",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "strategy",
  },
  {
    question: "Which is the best definition of PMF (Product-Market Fit)?",
    options: ["When CAC decreases", "Strong market demand validated by retention, engagement, and organic growth", "A successful ad campaign", "A large feature set implemented"],
    answer: "Strong market demand validated by retention, engagement, and organic growth",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "product-market-fit",
  },
  {
    question: "Which metric framework is known as 'pirate metrics'?",
    options: ["KPI", "AARRR", "SMART", "HEART"],
    answer: "AARRR",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "metrics",
  },
  {
    question: "What is the primary advantage of an MVP?",
    options: ["Minimizes scope creep", "Tests core value with minimal investment and learning loops", "Eliminates the need for QA", "Guarantees revenue lift"],
    answer: "Tests core value with minimal investment and learning loops",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "mvp",
  },
  {
    question: "In experimentation, a Type I error is:",
    options: ["Failing to detect a true effect", "Detecting an effect that is not actually there (false positive)", "Confusing correlation and causation", "Using the wrong sample"],
    answer: "Detecting an effect that is not actually there (false positive)",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "experimentation",
  },
  {
    question: "What is 'scope creep'?",
    options: ["A formal change request", "Uncontrolled expansion of project scope without corresponding time/resources", "A sprint goal", "A bug backlog"],
    answer: "Uncontrolled expansion of project scope without corresponding time/resources",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "project-management",
  },
  {
    question: "Which is most aligned with outcome-driven roadmapping?",
    options: ["Shipping a set list of features on dates", "Aligning initiatives to measurable user/business outcomes", "Tracking team utilization", "Announcing quarterly releases"],
    answer: "Aligning initiatives to measurable user/business outcomes",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "roadmapping",
  },
  {
    question: "What best describes a PRD's purpose?",
    options: ["Detail every pixel design", "Align stakeholders on problem, goals, scope, success metrics, and constraints", "Replace discovery", "Serve as legal contract"],
    answer: "Align stakeholders on problem, goals, scope, success metrics, and constraints",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "documentation",
  },
  {
    question: "Which retention metric best indicates stickiness for a consumer habit product?",
    options: ["DAU/MAU ratio", "MAU", "Install count", "Pageviews"],
    answer: "DAU/MAU ratio",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "metrics",
  },
  {
    question: "In prioritization, 'Cost of Delay' captures:",
    options: ["Hosting expense", "Value lost per unit time by delaying delivery", "Developer hourly rates", "CAPEX only"],
    answer: "Value lost per unit time by delaying delivery",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "prioritization",
  },
  {
    question: "Which is a common pitfall in metric selection?",
    options: ["Choosing a mix of input and output measures", "Optimizing for vanity metrics that don't reflect value", "Defining guardrail metrics", "Using leading indicators"],
    answer: "Optimizing for vanity metrics that don't reflect value",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "metrics",
  },
  {
    question: "The HEART framework primarily focuses on:",
    options: ["Experiment design", "User-centered metrics: Happiness, Engagement, Adoption, Retention, Task success", "Pricing", "Sales funnels"],
    answer: "User-centered metrics: Happiness, Engagement, Adoption, Retention, Task success",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "frameworks",
  },
  {
    question: "A good North Star Metric for a marketplace often reflects:",
    options: ["Total registered users", "Successfully completed transactions delivering value to both sides", "Marketing spend", "Number of listings created"],
    answer: "Successfully completed transactions delivering value to both sides",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "metrics",
  },
  {
    question: "The main purpose of personas is to:",
    options: ["Replace segmentation", "Create empathy and align teams on archetypal needs and behaviors", "Forecast revenue", "Set sprint capacity"],
    answer: "Create empathy and align teams on archetypal needs and behaviors",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "research",
  },
  {
    question: "A sign-up funnel change increases form completion time by 15% but reduces error rate by 40% and increases verified sign-ups by 5%. What should be done next?",
    options: ["Roll back immediately", "Ship to 100% and monitor activation and downstream conversion", "Disable error checks", "Add more fields"],
    answer: "Ship to 100% and monitor activation and downstream conversion",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "experimentation",
  },
  {
    question: "A checkout page A/B test shows +3% conversion at 95% confidence but a 1% drop in average order value. With high volume and stable seasonality, what is the decision?",
    options: ["Ship variant; test cross-sell improvements next", "Reject due to AOV drop", "Inconclusive", "Increase discounting"],
    answer: "Ship variant; test cross-sell improvements next",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "experimentation",
  },
  {
    question: "Churn analysis shows most churn within 7 days due to users not completing a key setup step. Which action is best?",
    options: ["Add a tooltip somewhere else", "Redesign onboarding to make the setup step unavoidable and guided", "Reduce price", "Add more features"],
    answer: "Redesign onboarding to make the setup step unavoidable and guided",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "onboarding",
  },
  {
    question: "A B2B customer requests a custom compliance report that could delay roadmap items by two sprints but unlocks a large expansion deal. What's the best approach?",
    options: ["Reject all custom requests", "Evaluate modularizing the report to benefit many customers; commit with time-boxed scope if leverage exists", "Immediately re-assign entire team", "Ignore the deal"],
    answer: "Evaluate modularizing the report to benefit many customers; commit with time-boxed scope if leverage exists",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "b2b",
  },
  {
    question: "A search relevance change increases CTR but increases returns for apparel due to mismatched sizing expectations. Best follow-up?",
    options: ["Revert search relevance changes entirely", "Add stricter size filtering, better size guidance, and guardrail metrics in experiments", "Hide reviews", "Increase ads"],
    answer: "Add stricter size filtering, better size guidance, and guardrail metrics in experiments",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "search",
  },
  {
    question: "A mobile app sees engagement drop after adding heavy animations to the product page. Diagnostics show 18% slower load times on low-end Android devices. What should be prioritized?",
    options: ["More animations", "Performance budget and progressive enhancement for low-end devices", "Only optimize for flagship phones", "Remove images"],
    answer: "Performance budget and progressive enhancement for low-end devices",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "mobile",
  },
  {
    question: "Customer interviews indicate confusion between 'Save for later' and 'Wishlist.' What is the best next step?",
    options: ["Rename randomly", "Run usability tests with prototypes exploring combined or clarified flows", "Remove both features", "Add a tooltip only"],
    answer: "Run usability tests with prototypes exploring combined or clarified flows",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "ux",
  },
  {
    question: "A subscription product sees high trial starts but poor conversion at day 7. Which experiment is most likely to help?",
    options: ["Shorten trial to 3 days", "Deliver an in-trial 'aha moment' checklist and usage nudges tied to value", "Increase price", "Remove trial"],
    answer: "Deliver an in-trial 'aha moment' checklist and usage nudges tied to value",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "subscription",
  },
  {
    question: "A marketplace has a cold-start problem on the supply side in a new city. Best GTM move?",
    options: ["National TV campaign", "Targeted supply seeding with incentives and white-glove onboarding for early suppliers", "Raise platform fees", "Pause expansion"],
    answer: "Targeted supply seeding with incentives and white-glove onboarding for early suppliers",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "marketplace",
  },
  {
    question: "Analytics show 70% of cart abandoners are on COD; many cite 'address not verified' errors. What should be done?",
    options: ["Disable COD", "Improve address validation UX, suggest auto-complete and verification help, and allow save-and-complete-later", "Increase COD fees", "Remove address validation"],
    answer: "Improve address validation UX, suggest auto-complete and verification help, and allow save-and-complete-later",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "checkout",
  },
  {
    question: "During a sprint, a critical dependency slips and threatens the release. Best PM action?",
    options: ["Ignore it", "Re-scope to an MVP, renegotiate sequencing, and communicate new timeline and risks", "Blame engineering", "Cancel the feature"],
    answer: "Re-scope to an MVP, renegotiate sequencing, and communicate new timeline and risks",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "project-management",
  },
  {
    question: "A growth experiment to add referral rewards shows no lift in referrals but higher fraud. Next step?",
    options: ["Scale to 100%", "Tighten anti-fraud rules, identity checks, and consider delayed rewards tied to quality events", "Increase reward amount", "Stop tracking fraud"],
    answer: "Tighten anti-fraud rules, identity checks, and consider delayed rewards tied to quality events",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "growth",
  },
  {
    question: "A B2C finance app's NSM is 'weekly active users completing one budget action.' A new feature increases time-in-app but not budget actions. Decision?",
    options: ["Celebrate time increase", "Iterate to connect feature to budget actions with prompts and shortcuts", "Remove NSM", "Increase ads"],
    answer: "Iterate to connect feature to budget actions with prompts and shortcuts",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "metrics",
  },
  {
    question: "Your data shows distinct cohorts with different paywall conversion moments. Best pricing experiment?",
    options: ["One-price-fits-all", "Segmented paywalls triggered by behavior thresholds tied to value perception", "Immediate hard paywall for all", "Remove paywall"],
    answer: "Segmented paywalls triggered by behavior thresholds tied to value perception",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "pricing",
  },
  {
    question: "A mobile funnel shows a drop at OTP verification due to SMS delays. Best mitigation?",
    options: ["Remove OTP", "Add call-based OTP fallback, resend timers, device autofill, and clear error handling", "Force email only", "Increase steps"],
    answer: "Add call-based OTP fallback, resend timers, device autofill, and clear error handling",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "mobile",
  },
  {
    question: "A multi-tenant analytics feature is requested urgently by enterprise prospects; engineering suggests a 3-month build. Best approach?",
    options: ["Promise delivery in 2 weeks", "Explore a phased approach: read-only first, limited scope tenants, then full RBAC; validate demand with design partners", "Decline all enterprise prospects", "Shift all resources without plan"],
    answer: "Explore a phased approach: read-only first, limited scope tenants, then full RBAC; validate demand with design partners",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "enterprise",
  },
  {
    question: "Post-launch, support tickets spike around onboarding errors for enterprise SSO. Best next step?",
    options: ["Close tickets", "Instrument error states, add self-serve SSO setup wizard, and publish admin guides", "Remove SSO", "Increase engineering headcount only"],
    answer: "Instrument error states, add self-serve SSO setup wizard, and publish admin guides",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "enterprise",
  },
  {
    question: "You must pick one of three features. Feature A: high impact, low confidence, medium effort. Feature B: medium impact, high confidence, low effort. Feature C: high impact, medium confidence, very high effort. Using RICE-like thinking, which is most likely first?",
    options: ["Feature A", "Feature B", "Feature C", "Random choice"],
    answer: "Feature B",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "prioritization",
  },
  {
    question: "An AI-based recommendation change improves CTR but worsens session-level diversity. How to proceed?",
    options: ["Optimize CTR only", "Add diversity constraints as a guardrail metric and retune the model", "Remove recommendations", "Increase ad slots"],
    answer: "Add diversity constraints as a guardrail metric and retune the model",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "ai",
  },
  {
    question: "A key enterprise prospect requires SOC 2 compliance to buy. Your roadmap has it next quarter. What's the best commercial move?",
    options: ["Delay any conversation", "Offer a signed letter of intent contingent on SOC 2 timeline with interim controls and security documentation", "Offer a steep discount without compliance", "Ignore the request"],
    answer: "Offer a signed letter of intent contingent on SOC 2 timeline with interim controls and security documentation",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "enterprise",
  },
  {
    question: "An onboarding flow shows high drop-off on a permissions screen (notifications, location). What's the best optimization?",
    options: ["Ask all permissions upfront", "Just-in-time permission prompts contextualized to benefits", "Remove permissions entirely", "Force allow"],
    answer: "Just-in-time permission prompts contextualized to benefits",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "onboarding",
  },
  {
    question: "A feature is used heavily by 5% of users who generate 40% of revenue. What should the roadmap likely do?",
    options: ["Deprioritize niche features always", "Invest in improvements for that segment while exploring broader value", "Remove feature", "Hide behind paywall only"],
    answer: "Invest in improvements for that segment while exploring broader value",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "revenue",
  },
  {
    question: "A product manager receives conflicting stakeholder requests that exceed capacity. Best practice?",
    options: ["Say yes to all", "Use a transparent prioritization framework with aligned criteria and communicate trade-offs", "Delay decision", "Increase standups"],
    answer: "Use a transparent prioritization framework with aligned criteria and communicate trade-offs",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "stakeholder-management",
  },
  {
    question: "A retention analysis reveals users who complete 3 projects in the first week retain 2x. What is the most impactful experiment?",
    options: ["Add more themes", "Onboarding that guides to first 3 projects with checklists, templates, and celebration moments", "Increase price", "Add dark mode"],
    answer: "Onboarding that guides to first 3 projects with checklists, templates, and celebration moments",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "retention",
  },
  {
    question: "A checkout page for India shows high drop-off for prepaid cards at 3DS step. What should be tried first?",
    options: ["Remove 3DS", "Add UPI as a prominent option and optimize 3DS UX with clearer states and retries", "Hide EMI", "Increase COD only"],
    answer: "Add UPI as a prominent option and optimize 3DS UX with clearer states and retries",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "payments",
  },
  {
    question: "A B2B workflow tool gets a request for a custom integration. You see multiple similar asks across prospects. Best approach?",
    options: ["Ignore as edge case", "Build a generic integration framework and publish APIs/webhooks to scale", "Hard-code for each client", "Only build after IPO"],
    answer: "Build a generic integration framework and publish APIs/webhooks to scale",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "b2b",
  },
  {
    question: "Your signup experiment reaches significance early, but a known holiday campaign affects traffic mix. Correct call?",
    options: ["Ship anyway", "Pause or extend test, stratify by channel, and re-run to ensure unbiased significance", "Change variant mid-test", "Ignore confounds"],
    answer: "Pause or extend test, stratify by channel, and re-run to ensure unbiased significance",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "experimentation",
  },
  {
    question: "Mobile signups dip only on low-bandwidth networks. Best first fix?",
    options: ["Larger images", "Lightweight assets, adaptive image sizes, offline-friendly states, and reduce JS bundle", "More carousels", "Longer videos"],
    answer: "Lightweight assets, adaptive image sizes, offline-friendly states, and reduce JS bundle",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "mobile",
  },
  {
    question: "Customer research shows older adults struggle with text size and navigation depth. Best product change?",
    options: ["More features on one screen", "Add a 'Senior Mode' with larger fonts, higher contrast, simplified IA", "Force desktop usage", "Add popups"],
    answer: "Add a 'Senior Mode' with larger fonts, higher contrast, simplified IA",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "accessibility",
  },
  {
    question: "A freemium tool has poor conversion from free to paid due to unclear paywall value. Best experiment?",
    options: ["Hide premium features", "Contextual upsell moments that preview premium outcomes and remove friction at upgrade", "Extend free plan indefinitely", "Increase price"],
    answer: "Contextual upsell moments that preview premium outcomes and remove friction at upgrade",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "freemium",
  },
  {
    question: "A team wants to ship a weather-dependent logistics feature during peak season, risking a two-month delay. Best handling?",
    options: ["Reject outright", "MVP scope for core weather alerts; iterate post-peak to deepen", "Delay peak season launch fully", "Build separate app"],
    answer: "MVP scope for core weather alerts; iterate post-peak to deepen",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "mvp",
  },
  {
    question: "A content platform's NSM is 'weekly learning minutes.' A redesign increases clicks but lowers learning minutes. Response?",
    options: ["Celebrate CTR", "Adjust layout and recs to increase session depth and learning completion", "Add more ads", "Ignore NSM"],
    answer: "Adjust layout and recs to increase session depth and learning completion",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "metrics",
  },
  {
    question: "A cohort analysis shows users acquired via influencers have higher initial engagement but worse month-2 retention. Next step?",
    options: ["Increase influencer spend only", "Tailor onboarding for this cohort, set guardrails, and test retention nudges", "Stop influencer channel entirely", "Ignore cohorts"],
    answer: "Tailor onboarding for this cohort, set guardrails, and test retention nudges",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "cohort-analysis",
  },
  {
    question: "A payments outage triggers social complaints. Immediate PM action?",
    options: ["Downplay", "Acknowledge transparently, share mitigation steps, and provide status page updates", "Blame gateway", "Turn off comments"],
    answer: "Acknowledge transparently, share mitigation steps, and provide status page updates",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "crisis-management",
  },
  {
    question: "A B2B admin portal shows admins spend too long creating roles. What's the best fix?",
    options: ["More fields", "Preset role templates and bulk actions guided by common use cases", "Remove roles", "Add animations"],
    answer: "Preset role templates and bulk actions guided by common use cases",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "b2b",
  },
  {
    question: "A data dashboard uses vanity metrics and is ignored by leadership. What should be done?",
    options: ["Add more charts", "Redesign around decision-centric metrics tied to OKRs and define owners", "Increase color usage", "Hide negative data"],
    answer: "Redesign around decision-centric metrics tied to OKRs and define owners",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "metrics",
  },
  {
    question: "A search page has high zero-result rate for misspellings. First optimization?",
    options: ["Do nothing", "Add spell correction, synonyms, and 'did you mean' with fallback suggestions", "Remove search", "Add more ads"],
    answer: "Add spell correction, synonyms, and 'did you mean' with fallback suggestions",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "search",
  },
  {
    question: "An ecommerce platform sees returns spike for a new apparel brand. Which first steps help?",
    options: ["Blame customers", "Segment returns by size, fit feedback, product images; add fit guides and review prompts", "Remove the brand immediately", "Increase price"],
    answer: "Segment returns by size, fit feedback, product images; add fit guides and review prompts",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "ecommerce",
  },
  {
    question: "A SaaS product has many inactive projects cluttering dashboards. What should be tried?",
    options: ["Ignore", "Auto-archive inactive projects with undo and teach retrieval", "Delete all", "Hide filters"],
    answer: "Auto-archive inactive projects with undo and teach retrieval",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "saas",
  },
  {
    question: "You must decide between two onboarding variants: A achieves faster time-to-value; B gets higher NPS but slower completion. Which is better initially?",
    options: ["Variant A; optimize for first value to drive retention, then refine satisfaction", "Variant B", "Random choice", "Neither"],
    answer: "Variant A; optimize for first value to drive retention, then refine satisfaction",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "onboarding",
  },
  {
    question: "A pricing page has many plans and low conversions. Best first improvement?",
    options: ["Add more plans", "Reduce cognitive load with 2–3 clear tiers and guided plan selection by use case", "Hide prices", "Increase yearly discount only"],
    answer: "Reduce cognitive load with 2–3 clear tiers and guided plan selection by use case",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "onboarding",
  },
  {
    question: "A multi-tenant analytics feature is requested urgently by enterprise prospects; engineering suggests a 3-month build. Best approach?",
    options: ["Promise delivery in 2 weeks", "Explore a phased approach: read-only first, limited scope tenants, then full RBAC; validate demand with design partners", "Decline all enterprise prospects", "Shift all resources without plan"],
    answer: "Explore a phased approach: read-only first, limited scope tenants, then full RBAC; validate demand with design partners",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "onboarding",
  },
  {
    question: "A mobile funnel shows a drop at OTP verification due to SMS delays. Best mitigation?",
    options: ["Remove OTP", "Add call-based OTP fallback, resend timers, device autofill, and clear error handling", "Force email only", "Increase steps"],
    answer: "Add call-based OTP fallback, resend timers, device autofill, and clear error handling",
    hasImage: false,
    imageUrl: null,
    category: "product-management-advance-skills",
    subCategory: "onboarding",
  },
]

const productMetricsQuestions = [
  // Conceptual Questions (25)
  {
    question: "Which statement best describes a North Star Metric (NSM)?",
    options: ["A revenue target for the quarter", "A single, value-centric metric capturing the core user value delivered", "A composite score of all KPIs", "A brand awareness number"],
    answer: "A single, value-centric metric capturing the core user value delivered",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "north-star-metrics",
  },
  {
    question: "In the AARRR framework, which metric primarily reflects activation?",
    options: ["Users completing the first key value action", "Number of signups", "NPS", "Paid conversions"],
    answer: "Users completing the first key value action",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "aarrr-framework",
  },
  {
    question: "Which metric is a leading indicator of retention for a habit-forming app?",
    options: ["DAU/MAU ratio", "Quarterly revenue", "Gross margin", "Churn rate"],
    answer: "DAU/MAU ratio",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "retention-metrics",
  },
  {
    question: "What makes a metric a vanity metric?",
    options: ["It is visualized with a chart", "It looks impressive but does not inform decisions or reflect user value", "It is a top-line number", "It is an aggregate"],
    answer: "It looks impressive but does not inform decisions or reflect user value",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "vanity-metrics",
  },
  {
    question: "Which KPI most directly measures monetization efficiency?",
    options: ["CAC", "CLV/CAC ratio", "MAU", "Pageviews"],
    answer: "CLV/CAC ratio",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "monetization-metrics",
  },
  {
    question: "What is the primary difference between input and output metrics?",
    options: ["Inputs are financial; outputs are operational", "Inputs are controllable activities that drive outcomes; outputs are the results", "Inputs are lagging; outputs are leading", "Inputs are always user metrics"],
    answer: "Inputs are controllable activities that drive outcomes; outputs are the results",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "input-output-metrics",
  },
  {
    question: "Which is the best guardrail metric during experimentation on conversion?",
    options: ["Session length", "Return rate or refund rate", "Pageviews", "Email opens"],
    answer: "Return rate or refund rate",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "guardrail-metrics",
  },
  {
    question: "What does DAU/MAU approximate?",
    options: ["User acquisition velocity", "Habit strength or stickiness", "Revenue per user", "Marketing ROI"],
    answer: "Habit strength or stickiness",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "engagement-metrics",
  },
  {
    question: "For a marketplace, which is the healthiest NSM proxy?",
    options: ["Listings created", "Completed, high-quality transactions", "App installs", "Push opt-ins"],
    answer: "Completed, high-quality transactions",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "marketplace-metrics",
  },
  {
    question: "What is the purpose of cohort analysis?",
    options: ["Aggregate all users by month", "Track behavior/outcomes of groups sharing a start event over time", "Visualize a funnel", "Measure paid marketing efficiency"],
    answer: "Track behavior/outcomes of groups sharing a start event over time",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "cohort-analysis",
  },
  {
    question: "Which metric best indicates activation success in SaaS?",
    options: ["Time-to-first-value (TTFV)", "Bounce rate", "MQL count", "ARPPU"],
    answer: "Time-to-first-value (TTFV)",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "saas-metrics",
  },
  {
    question: "Why use leading indicators?",
    options: ["They confirm past results", "They forecast likely outcomes earlier to enable faster course-correction", "They replace output metrics", "They are always qualitative"],
    answer: "They forecast likely outcomes earlier to enable faster course-correction",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "leading-indicators",
  },
  {
    question: "What does Net Revenue Retention (NRR) capture?",
    options: ["New revenue from new customers", "Expansion, contraction, and churn revenue within the same cohort", "Only churn", "Only upsell"],
    answer: "Expansion, contraction, and churn revenue within the same cohort",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "revenue-metrics",
  },
  {
    question: "Which KPI is most appropriate to assess funnel efficiency at top-of-funnel?",
    options: ["Impressions to signup conversion rate", "Customer lifetime value", "Net promoter score", "Average order value"],
    answer: "Impressions to signup conversion rate",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "funnel-metrics",
  },
  {
    question: "Which metric best measures the effectiveness of onboarding?",
    options: ["Sessions per user", "Activation rate within a defined time window", "Email open rate", "Push opt-in rate"],
    answer: "Activation rate within a defined time window",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "onboarding-metrics",
  },
  {
    question: "In pricing analytics, what does ARPU measure?",
    options: ["Profit per user", "Average revenue per user in a defined period", "Total revenue", "CAC per user"],
    answer: "Average revenue per user in a defined period",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "pricing-metrics",
  },
  {
    question: "Which property defines a 'good' KPI?",
    options: ["Hard to measure", "Directly tied to a decision, reliable, timely, and sensitive to changes", "Popular in the industry", "Maximizes dashboard space"],
    answer: "Directly tied to a decision, reliable, timely, and sensitive to changes",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "kpi-design",
  },
  {
    question: "The primary risk of optimizing only for conversion rate is:",
    options: ["Lower traffic", "Degrading user quality, AOV, or long-term retention", "Fewer features", "Higher server costs"],
    answer: "Degrading user quality, AOV, or long-term retention",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "conversion-optimization",
  },
  {
    question: "In experimentation, Minimum Detectable Effect (MDE) relates to:",
    options: ["CAC calculation", "Smallest effect size a test is powered to detect given sample and variance", "Survey bias", "Attribution windows"],
    answer: "Smallest effect size a test is powered to detect given sample and variance",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "experimentation",
  },
  {
    question: "Which metric most directly captures content depth in an ed-tech product?",
    options: ["CTR", "Lesson completion rate and learning minutes per user", "Pageviews", "Email open rate"],
    answer: "Lesson completion rate and learning minutes per user",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "content-metrics",
  },
  {
    question: "Which KPI best captures monetization in a freemium SaaS?",
    options: ["Free signups", "Free-to-paid conversion rate and expansion revenue", "Click-through rate", "App rating"],
    answer: "Free-to-paid conversion rate and expansion revenue",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "freemium-metrics",
  },
  {
    question: "What is the key purpose of guardrail metrics?",
    options: ["Decorate dashboards", "Prevent harm to critical user or business outcomes while optimizing a target metric", "Replace NSM", "Measure ad spend"],
    answer: "Prevent harm to critical user or business outcomes while optimizing a target metric",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "guardrail-metrics",
  },
  {
    question: "Which metric is most appropriate to monitor search quality?",
    options: ["Zero-result rate and post-search engagement", "Page load speed", "App installs", "NPS"],
    answer: "Zero-result rate and post-search engagement",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "search-metrics",
  },
  {
    question: "In customer support analytics, which is most indicative of quality?",
    options: ["Ticket volume alone", "First Contact Resolution (FCR) and CSAT", "Email open rate", "Hold music duration"],
    answer: "First Contact Resolution (FCR) and CSAT",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "support-metrics",
  },
  {
    question: "What's the best way to ensure KPI alignment across teams?",
    options: ["Let each team pick any metric", "Cascade from company NSM to team-level input metrics with clear ownership and definitions", "Only track revenue", "Update definitions frequently"],
    answer: "Cascade from company NSM to team-level input metrics with clear ownership and definitions",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "kpi-alignment",
  },
  // Practical Scenarios (25)
  {
    question: "A checkout experiment increases conversion by 2% but raises refund rate by 1.5pp. What's the decision?",
    options: ["Ship", "Don't ship; revisit UX and set refund rate as a guardrail", "Ignore refunds", "Increase ads"],
    answer: "Don't ship; revisit UX and set refund rate as a guardrail",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "experiment-analysis",
  },
  {
    question: "A mobile app shows DAU/MAU = 0.24, activation rate at 65%, and 7-day retention at 18%. Where should focus go first?",
    options: ["Acquisition", "Increasing stickiness and early habit loops to lift DAU/MAU and 7-day retention", "Monetization", "Support"],
    answer: "Increasing stickiness and early habit loops to lift DAU/MAU and 7-day retention",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "metric-prioritization",
  },
  {
    question: "A search page has a 12% zero-result rate. Which KPI change best verifies improvement after launching spell correction?",
    options: ["Increase pageviews", "Reduce zero-result rate and increase post-search clickthrough", "Increase impressions", "Increase installs"],
    answer: "Reduce zero-result rate and increase post-search clickthrough",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "search-optimization",
  },
  {
    question: "A marketplace city launch has high supply but low demand. Which KPI set should be targeted first?",
    options: ["Supply-side activation only", "Demand acquisition cost, conversion to first transaction, repeat purchase rate", "Listings per supplier only", "App ratings"],
    answer: "Demand acquisition cost, conversion to first transaction, repeat purchase rate",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "marketplace-optimization",
  },
  {
    question: "A freemium SaaS sees free-to-paid lift after adding an 'upgrade' modal, but NRR falls next month. Diagnosis KPI?",
    options: ["Time on site", "Churn and contraction rate in upgraded cohort", "MAU", "Email opens"],
    answer: "Churn and contraction rate in upgraded cohort",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "freemium-analysis",
  },
  {
    question: "A signup funnel has 8 steps and 55% completion. Which KPI change best proves improvement after simplification?",
    options: ["More unique visitors", "Higher activation rate and reduced time-to-first-value", "More pageviews", "Higher bounce rate"],
    answer: "Higher activation rate and reduced time-to-first-value",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "funnel-optimization",
  },
  {
    question: "A content app increases notifications, raising DAU but lowering session depth. How to evaluate?",
    options: ["Celebrate DAU", "Set session depth and key action completion as guardrails; tune notification relevance", "Turn off analytics", "Increase push volume more"],
    answer: "Set session depth and key action completion as guardrails; tune notification relevance",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "engagement-optimization",
  },
  {
    question: "A B2B product's NSM is 'monthly active teams completing 10 workflows.' A new feature increases individual actions but not team workflows. What's next?",
    options: ["Ship globally", "Iterate to tie the feature to workflows and measure team-level completions", "Measure only clicks", "Remove NSM"],
    answer: "Iterate to tie the feature to workflows and measure team-level completions",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "b2b-metrics",
  },
  {
    question: "A subscription app with annual plans has flat revenue despite higher signups. Which KPI reveals the issue?",
    options: ["Pageviews", "Trial-to-paid conversion and early churn for annual cohort", "Email clicks", "NPS only"],
    answer: "Trial-to-paid conversion and early churn for annual cohort",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "subscription-analysis",
  },
  {
    question: "The pricing page A/B test shows +5% conversion but -4% ARPU. How to decide?",
    options: ["Optimize for conversion only", "Evaluate net revenue per visitor and CLV impact; consider mixed pricing or bundles", "Ignore results", "Ship blindly"],
    answer: "Evaluate net revenue per visitor and CLV impact; consider mixed pricing or bundles",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "pricing-optimization",
  },
  {
    question: "After launching a new recommendation algorithm, AOV increases but return rates rise. What KPI should be a guardrail?",
    options: ["CTR", "Return rate and product dissatisfaction signals", "Pageviews", "Email open rate"],
    answer: "Return rate and product dissatisfaction signals",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "recommendation-metrics",
  },
  {
    question: "A funnel analysis shows 80% drop at KYC step. Most drop-offs are mobile, low bandwidth. What KPI changes validate the fix?",
    options: ["More sessions", "KYC completion rate, step latency, and abandonment reasons", "More emails", "More ads"],
    answer: "KYC completion rate, step latency, and abandonment reasons",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "kyc-optimization",
  },
  {
    question: "In a product-led B2B, marketing wants more MQLs. Sales complains about quality. What KPI best balances this?",
    options: ["MQL count", "PQLs and MQL→SQL conversion rate tied to closed-won", "Email CTR", "Webinar attendance"],
    answer: "PQLs and MQL→SQL conversion rate tied to closed-won",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "lead-quality-metrics",
  },
  {
    question: "For a two-sided marketplace, you plan to seed supply. Which KPIs prove network health post-seeding?",
    options: ["App installs", "Fill rate, time-to-first-match, repeat transacting users on both sides", "Pageviews", "Newsletter signups"],
    answer: "Fill rate, time-to-first-match, repeat transacting users on both sides",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "network-effects",
  },
  {
    question: "A mobile build improves speed by 30% on low-end devices. Which KPIs should move?",
    options: ["ARPU immediately", "Conversion rate, crash-free sessions, and retention on affected segments", "Email opens", "NPS only"],
    answer: "Conversion rate, crash-free sessions, and retention on affected segments",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "performance-metrics",
  },
  {
    question: "Your attribution model credits paid social for 60% of signups, but cohorts show poor retention. Next KPI focus?",
    options: ["CPM", "Channel-adjusted LTV and payback period", "CTR", "Impressions"],
    answer: "Channel-adjusted LTV and payback period",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "attribution-analysis",
  },
  {
    question: "A content platform wants to reduce churn. Which KPI is the best leading indicator to optimize?",
    options: ["Monthly revenue", "Content completion and weekly active learners", "Downloads", "Pageviews"],
    answer: "Content completion and weekly active learners",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "churn-prediction",
  },
  {
    question: "An onboarding experiment reduces steps by 30% but increases support tickets by 20%. Decision KPI?",
    options: ["Session count", "Net impact on activation rate, TTFV, and ticket rate as a guardrail", "MAU", "Likes"],
    answer: "Net impact on activation rate, TTFV, and ticket rate as a guardrail",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "onboarding-optimization",
  },
  {
    question: "A referral program doubles invites but conversion per invite drops. What KPI set should guide iteration?",
    options: ["Total invites only", "Invite-to-join conversion, fraud rate, and downstream retention of referred users", "DAU", "Push opens"],
    answer: "Invite-to-join conversion, fraud rate, and downstream retention of referred users",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "referral-metrics",
  },
  {
    question: "A team wants to adopt a new NSM. Which test ensures it's robust?",
    options: ["It's easy to measure", "It correlates with sustainable growth, is hard to game, lagging enough to reflect value but supported by leading inputs", "It's fashionable", "It's a composite"],
    answer: "It correlates with sustainable growth, is hard to game, lagging enough to reflect value but supported by leading inputs",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "nsm-validation",
  },
  {
    question: "A freemium tool's paywall shows high impressions but low conversion. Which KPI should be optimized first?",
    options: ["Pageviews", "Value exposure rate before paywall and post-exposure upgrade conversion", "Likes", "Scroll depth only"],
    answer: "Value exposure rate before paywall and post-exposure upgrade conversion",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "paywall-optimization",
  },
  {
    question: "Marketing proposes a deep discount to boost new users. What KPIs should be set as guardrails?",
    options: ["Ad impressions", "CAC payback, refund/return rate, and cohort LTV", "Social likes", "App rating"],
    answer: "CAC payback, refund/return rate, and cohort LTV",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "promotion-metrics",
  },
  {
    question: "A search relevance change improves CTR but reduces diversity. What KPI approach is correct?",
    options: ["CTR only", "Optimize for CTR with a diversity guardrail (e.g., entropy or category coverage)", "Only diversity", "No guardrails"],
    answer: "Optimize for CTR with a diversity guardrail (e.g., entropy or category coverage)",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "search-relevance",
  },
  {
    question: "A B2B analytics feature reduces time-on-dashboard by 20% while increasing task completion. Interpretation?",
    options: ["Worse engagement", "Better efficiency; track task success and time-to-insight as primary KPIs", "Irrelevant", "Ship nothing"],
    answer: "Better efficiency; track task success and time-to-insight as primary KPIs",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "efficiency-metrics",
  },
  {
    question: "You suspect a KPI is being gamed. What is the right response?",
    options: ["Ignore it", "Audit event definitions, add anti-gaming guardrails, triangulate with corroborating metrics tied to value", "Remove analytics", "Increase targets"],
    answer: "Audit event definitions, add anti-gaming guardrails, triangulate with corroborating metrics tied to value",
    hasImage: false,
    imageUrl: null,
    category: "product-metrics-skills",
    subCategory: "metric-integrity",
  },
];

// Combined export
const questionsArray = [...productManagementAdvancedQuestions, ...productMetricsQuestions];

const createQuizQuestion = async (req, res) => {
  try {
    const { question, options, answer, hasImage, imageUrl, category, subCategory } = req.body;

    if (!question || !options || !answer || !category || !subCategory) {
      return res.status(400).json({ message: "Required fields missing." });
    }

    const newQuestion = await QuizQuestion.create({
      question,
      options,
      answer,
      hasImage,
      imageUrl: hasImage ? imageUrl : null,
      category,
      subCategory,
    });

    res.status(201).json(newQuestion);
  } catch (error) {
    console.error("❌ Error creating quiz question:", error);
    res.status(500).json({ message: "Server Error", error });
  }
};

const bulkCreateQuizQuestions = async (req, res) => {
  try {

    // Validate that questions array exists and is not empty
    if (!questionsArray || !Array.isArray(questionsArray) || questionsArray.length === 0) {
      return res.status(400).json({
        message: "Questions array is required and must contain at least one question."
      });
    }

    // Validate each question in the array
    const validationErrors = [];
    const validatedQuestions = [];

    questionsArray.forEach((questionData, index) => {
      const { question, options, answer, hasImage, imageUrl, category, subCategory } = questionData;

      // Check required fields
      if (!question || !options || !answer || !category || !subCategory) {
        validationErrors.push({
          index,
          message: "Required fields missing (question, options, answer, category, subCategory)",
          data: questionData
        });
        return;
      }

      // Validate options array
      if (!Array.isArray(options) || options.length < 2) {
        validationErrors.push({
          index,
          message: "Options must be an array with at least 2 choices",
          data: questionData
        });
        return;
      }

      // Validate that answer exists in options
      if (!options.includes(answer)) {
        validationErrors.push({
          index,
          message: "Answer must be one of the provided options",
          data: questionData
        });
        return;
      }

      // Prepare validated question data
      validatedQuestions.push({
        question,
        options,
        answer,
        hasImage: hasImage || false,
        imageUrl: hasImage ? imageUrl : null,
        category,
        subCategory,
      });
    });

    // If there are validation errors, return them
    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: "Validation errors found in questions",
        errors: validationErrors,
        totalErrors: validationErrors.length,
        totalQuestions: questions.length
      });
    }

    // Bulk insert using Sequelize
    const createdQuestions = await QuizQuestion.bulkCreate(validatedQuestions, {
      validate: true, // Run model validations
      returning: true // Return created records (for PostgreSQL)
    });

    res.status(201).json({
      message: "Quiz questions created successfully",
      totalCreated: createdQuestions.length,
      questions: createdQuestions
    });

  } catch (error) {
    console.error("❌ Error bulk creating quiz questions:", error);

    // Handle Sequelize validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        message: "Validation error",
        errors: error.errors.map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }))
      });
    }

    // Handle unique constraint errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        message: "Duplicate entry found",
        errors: error.errors.map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }))
      });
    }

    res.status(500).json({
      message: "Server Error",
      error: error.message
    });
  }
};

// Update a quiz question by ID
const updateQuizQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, options, answer, hasImage, imageUrl, category, subCategory } = req.body;

    // Find the existing question
    const quizQuestion = await QuizQuestion.findByPk(id);

    if (!quizQuestion) {
      return res.status(404).json({ message: "Quiz question not found" });
    }

    // Update fields if provided
    quizQuestion.question = question ?? quizQuestion.question;
    quizQuestion.options = options ?? quizQuestion.options;
    quizQuestion.answer = answer ?? quizQuestion.answer;
    quizQuestion.hasImage = hasImage ?? quizQuestion.hasImage;
    quizQuestion.imageUrl = hasImage ? imageUrl : null;
    quizQuestion.category = category ?? quizQuestion.category;
    quizQuestion.subCategory = subCategory ?? quizQuestion.subCategory;

    // Save updates
    await quizQuestion.save();

    res.status(200).json(quizQuestion);
  } catch (error) {
    console.error("❌ Error updating quiz question:", error);
    res.status(500).json({ message: "Server Error", error });
  }
};

// Get all quiz questions
const getAllQuizQuestions = async (req, res) => {
  try {
    const questions = await QuizQuestion.findAll();
    res.status(200).json(questions);
  } catch (error) {
    console.error("❌ Error fetching quiz questions:", error);
    res.status(500).json({ message: "Server Error", error });
  }
};

// Delete a quiz question by ID
const deleteQuizQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await QuizQuestion.destroy({ where: { id } });

    if (!deleted) {
      return res.status(404).json({ message: "Quiz question not found" });
    }

    res.status(200).json({ message: "Quiz question deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting quiz question:", error);
    res.status(500).json({ message: "Server Error", error });
  }
};


module.exports = {
  createQuizQuestion,
  updateQuizQuestion,
  getAllQuizQuestions,
  deleteQuizQuestion,
  bulkCreateQuizQuestions
};
