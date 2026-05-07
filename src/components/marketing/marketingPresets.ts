export interface GenerationPreset {
  id: string;
  label: string;
  labelEn: string;
  tone: string;
  audience: string;
  ctaStyle: string;
  hashtagStyle: string;
  suggestedStructure: string;
}

export interface PostStructure {
  id: string;
  label: string;
  labelEn: string;
  description: string;
}

export const GENERATION_PRESETS: GenerationPreset[] = [
  {
    id: "safety_tip",
    label: "Sikkerhetstips",
    labelEn: "Safety tip",
    tone: "Authoritative but approachable. Share practical safety knowledge that operators can apply immediately.",
    audience: "Drone operators, safety officers, aviation professionals",
    ctaStyle: "Soft CTA — invite discussion or link to a resource. Example: 'What's your pre-flight safety routine?'",
    hashtagStyle: "Industry-specific: #DroneSafety #UAS #AviationSafety #RPAS",
    suggestedStructure: "hook_insight_cta",
  },
  {
    id: "compliance_tip",
    label: "Compliance-tips",
    labelEn: "Compliance tip",
    tone: "Clear, factual, helpful. Position as a knowledgeable guide through complex regulations.",
    audience: "Drone operators, compliance managers, aviation authorities",
    ctaStyle: "Educational CTA — link to regulation source or AviSafe feature. Example: 'Stay compliant with automated tracking.'",
    hashtagStyle: "Regulatory: #DroneRegulations #EASA #UASCompliance #AviSafe",
    suggestedStructure: "problem_solution_cta",
  },
  {
    id: "product_update",
    label: "Produktoppdatering",
    labelEn: "Product update",
    tone: "Confident and specific. Focus on what changed and why it matters to the user.",
    audience: "Current AviSafe users, prospective customers evaluating solutions",
    ctaStyle: "Direct CTA — try the feature or read the changelog. Example: 'Try it now in your dashboard.'",
    hashtagStyle: "Product: #AviSafe #DroneOps #ProductUpdate #SaaS",
    suggestedStructure: "news_update",
  },
  {
    id: "feature_announcement",
    label: "Ny funksjon",
    labelEn: "New feature announcement",
    tone: "Excited but grounded. Show the real value without overpromising.",
    audience: "AviSafe users, drone industry professionals, potential customers",
    ctaStyle: "Action CTA — sign up, request demo, or explore. Example: 'See how it works →'",
    hashtagStyle: "Launch: #NewFeature #AviSafe #DroneManagement #Innovation",
    suggestedStructure: "hook_insight_cta",
  },
  {
    id: "industry_insight",
    label: "Bransjeinnsikt",
    labelEn: "Industry insight",
    tone: "Thoughtful and informed. Share a perspective that adds value to the conversation.",
    audience: "Industry leaders, decision-makers, drone professionals",
    ctaStyle: "Engagement CTA — ask for opinions or share experience. Example: 'What trends are you seeing?'",
    hashtagStyle: "Industry: #DroneIndustry #Aviation #UAS #FutureOfFlight",
    suggestedStructure: "thought_leadership",
  },
  {
    id: "operational_best_practice",
    label: "Operativ beste praksis",
    labelEn: "Operational best practice",
    tone: "Practical and experienced. Write as someone who has done this work, not just read about it.",
    audience: "Drone operators, field crews, operations managers",
    ctaStyle: "Utility CTA — download checklist or try a workflow. Example: 'Use this checklist before your next mission.'",
    hashtagStyle: "Operations: #DroneOps #BestPractice #FlightOps #Checklist",
    suggestedStructure: "checklist_tips",
  },
  {
    id: "incident_learning",
    label: "Hendelseslæring",
    labelEn: "Incident learning",
    tone: "Serious and constructive. Focus on learning, not blame. Be respectful of the incident.",
    audience: "Safety officers, drone operators, aviation safety community",
    ctaStyle: "Reflection CTA — encourage discussion or safety review. Example: 'When did you last review your incident procedures?'",
    hashtagStyle: "Safety: #IncidentReporting #SafetyCulture #LessonsLearned #ECCAIRS",
    suggestedStructure: "problem_solution_cta",
  },
  {
    id: "founder_update",
    label: "Grunnlegger-oppdatering",
    labelEn: "Founder update / Build in public",
    tone: "Honest, personal, transparent. Share real challenges and wins without corporate polish.",
    audience: "Startup community, drone industry followers, potential partners and investors",
    ctaStyle: "Personal CTA — follow the journey, give feedback. Example: 'Follow along as we build AviSafe.'",
    hashtagStyle: "Founder: #BuildInPublic #StartupLife #AviSafe #DroneStartup",
    suggestedStructure: "hook_insight_cta",
  },
];

export const POST_STRUCTURES: PostStructure[] = [
  {
    id: "hook_insight_cta",
    label: "Hook + Innsikt + CTA",
    labelEn: "Hook + Insight + CTA",
    description: "Start with a compelling hook, share a key insight or story, end with a clear call to action.",
  },
  {
    id: "problem_solution_cta",
    label: "Problem + Løsning + CTA",
    labelEn: "Problem + Solution + CTA",
    description: "Identify a real problem your audience faces, present a practical solution, close with next steps.",
  },
  {
    id: "short_educational",
    label: "Kort utdanningsinnlegg",
    labelEn: "Short educational post",
    description: "A concise, informative post that teaches one thing well. No fluff.",
  },
  {
    id: "news_update",
    label: "Produkt-/nyhetsoppdatering",
    labelEn: "Product/news update",
    description: "Announce something new. Lead with what changed and why it matters.",
  },
  {
    id: "thought_leadership",
    label: "Tankelederskap",
    labelEn: "Thought leadership",
    description: "Share a perspective or opinion on an industry trend. Be specific and take a stance.",
  },
  {
    id: "checklist_tips",
    label: "Sjekkliste / tips",
    labelEn: "Checklist / tips post",
    description: "A numbered or bulleted list of actionable tips. Easy to scan, high utility.",
  },
];

export const VISUAL_TEMPLATES = [
  { id: "feature_highlight", label: "Feature Highlight" },
  { id: "safety_tip_card", label: "Safety Tip Card" },
  { id: "product_update", label: "Product Update Visual" },
  { id: "dashboard_highlight", label: "Aviation Dashboard" },
  { id: "mission_planning", label: "Drone Mission Planning" },
];

export const BRAND_VOICE_DEFAULTS = {
  rules: [
    "Professional B2B tone — write for drone operators and aviation professionals",
    "Clear and concise language — every sentence should earn its place",
    "Practical value first — always give the reader something useful",
    "No exaggerated claims — never say 'revolutionary', 'game-changing', or 'world-class' without proof",
    "No fake numbers or unsupported statements",
    "Avoid sounding like a generic social media guru",
    "Use maximum 1-2 emojis per post, if any",
    "Prefer credibility over hype — show, don't tell",
    "Mention AviSafe naturally — it should feel like a helpful mention, not a sales pitch",
    "Write like a knowledgeable colleague, not a marketing department",
  ],
  bannedPhrases: [
    "game-changer",
    "revolutionary",
    "world-class",
    "best-in-class",
    "cutting-edge",
    "next-level",
    "unlock your potential",
    "synergy",
    "disruptive",
    "paradigm shift",
    "leverage",
    "circle back",
    "move the needle",
    "deep dive",
    "10x your results",
  ],
  ctaStyles: [
    { id: "soft", label: "Myk — spør til diskusjon" },
    { id: "educational", label: "Utdannende — lenke til ressurs" },
    { id: "direct", label: "Direkte — prøv eller registrer" },
    { id: "personal", label: "Personlig — følg reisen" },
  ],
  hashtagStyles: [
    { id: "minimal", label: "Minimal (2-3 hashtags)" },
    { id: "moderate", label: "Moderat (4-6 hashtags)" },
    { id: "extensive", label: "Utvidet (6-10 hashtags)" },
  ],
  defaultAudiences: {
    linkedin: "Drone operators, aviation professionals, B2B decision-makers",
    facebook: "Drone enthusiasts, local aviation community, potential customers",
    instagram: "Visual drone community, tech-curious followers, brand awareness",
    blog: "Industry professionals seeking in-depth knowledge, SEO audience",
    email: "Existing customers and newsletter subscribers",
  },
};
