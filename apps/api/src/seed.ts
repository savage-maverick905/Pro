// Default data that the SQL migrations used to insert. Applied idempotently by `npm run migrate`.
export const DEFAULT_SETTINGS: Record<string, Record<string, unknown>> = {
  research: { paused: false, concurrency: 2, depth: 'fast', freshnessDays: 30, maxPerSweep: 50 },
  scoring: { weights: { websiteDeficiency: 25, problem: 25, solutionValue: 20, contactAccess: 15, evidenceConfidence: 10, activity: 5 } },
  ai: { enabled: true, dailyTokenLimit: 300000, maxOutputTokensFast: 1200, maxOutputTokensDeep: 2000 },
  outreach: { senderName: '', senderBusiness: '', signature: '', defaultCta: '', optOutLine: '', language: 'English' },
};

// target_categories match loosely against the business category text; an empty list means "any business".
export const DEFAULT_SERVICES: { name: string; description: string; target_categories: string[]; problems_solved: string[]; keywords: string[]; priority: number }[] = [
  {name: "Business websites", description: "Simple professional site showing services, location and contact details", target_categories: [], problems_solved: ["no website found", "weak online presence"], keywords: ["website", "business site"], priority: 8},
  {name: "Corporate websites", description: "Multi-page company site for established firms", target_categories: ["lawyer", "financial", "insurance", "construction", "consulting", "it"], problems_solved: ["outdated corporate presence"], keywords: ["corporate"], priority: 5},
  {name: "Landing pages", description: "Single focused page for one offer or campaign", target_categories: [], problems_solved: ["no clear call to action"], keywords: ["landing page", "campaign"], priority: 5},
  {name: "E-commerce websites", description: "Online store with catalogue, cart and checkout", target_categories: ["shop", "clothes", "shoes", "boutique", "gift", "supermarket", "furniture", "electronics"], problems_solved: ["no online store found"], keywords: ["store", "shop online"], priority: 7},
  {name: "Custom web applications", description: "Bespoke web tools built around a specific process", target_categories: [], problems_solved: ["manual processes"], keywords: ["web app"], priority: 3},
  {name: "SaaS platforms", description: "Subscription software products", target_categories: [], problems_solved: [], keywords: ["saas"], priority: 2},
  {name: "Booking systems", description: "Online reservations for tables, rooms or classes", target_categories: ["hairdresser", "beauty", "barber", "dentist", "clinic", "doctors", "hotel", "guest_house", "hostel", "fitness_centre", "restaurant", "yoga", "pilates"], problems_solved: ["no online booking found"], keywords: ["booking", "reservations"], priority: 8},
  {name: "Appointment systems", description: "Online scheduling for professional services", target_categories: ["clinic", "dentist", "doctors", "lawyer", "accountant", "hairdresser", "beauty", "tax_advisor"], problems_solved: ["no online booking found"], keywords: ["appointments", "scheduling"], priority: 7},
  {name: "Restaurant ordering systems", description: "Online menu with ordering and pickup or delivery", target_categories: ["restaurant", "cafe", "fast_food", "bar", "bakery"], problems_solved: ["no online ordering found"], keywords: ["online ordering", "menu"], priority: 7},
  {name: "Online catalogues", description: "Browsable product or service catalogue without checkout", target_categories: ["shop", "furniture", "electronics", "car", "car_repair"], problems_solved: ["no services found", "no pricing found"], keywords: ["catalogue", "catalog"], priority: 6},
  {name: "Portfolio websites", description: "Gallery of past work and testimonials", target_categories: ["craft", "builder", "photographer", "architect", "design", "yoga"], problems_solved: ["no services found"], keywords: ["portfolio", "gallery"], priority: 5},
  {name: "Website redesign", description: "Modernise a site that is hard to use or not mobile-friendly", target_categories: [], problems_solved: ["no mobile viewport", "weak navigation", "thin content", "missing title"], keywords: ["redesign", "modernise"], priority: 8},
  {name: "Website maintenance", description: "Ongoing updates, security and fixes", target_categories: [], problems_solved: ["broken links", "outdated site"], keywords: ["maintenance", "support"], priority: 4},
  {name: "SEO improvements", description: "Fix titles, descriptions, headings and structure for search visibility", target_categories: [], problems_solved: ["missing meta description", "missing title", "no h1", "noindex"], keywords: ["seo"], priority: 6},
  {name: "Website performance optimization", description: "Speed up slow pages", target_categories: [], problems_solved: ["slow response", "poor pagespeed performance"], keywords: ["speed", "performance"], priority: 6},
  {name: "Payment integration", description: "Take online payments or deposits", target_categories: ["shop", "school", "fitness_centre", "hotel"], problems_solved: ["no online store found"], keywords: ["payments"], priority: 4},
  {name: "API integrations", description: "Connect the site to existing business tools", target_categories: [], problems_solved: [], keywords: ["api", "integration"], priority: 2},
  {name: "Customer portals", description: "Logged-in area for customers", target_categories: ["school", "bank", "insurance", "fitness_centre"], problems_solved: [], keywords: ["portal", "login"], priority: 3},
  {name: "Admin dashboards", description: "Internal dashboards for staff", target_categories: [], problems_solved: [], keywords: ["dashboard"], priority: 2},
  {name: "Content management systems", description: "Let staff edit the site themselves", target_categories: ["hotel", "school", "construction", "restaurant"], problems_solved: ["site is hard to update"], keywords: ["cms"], priority: 5},
  {name: "Educational platforms", description: "Online courses and learning portals", target_categories: ["school", "college", "university"], problems_solved: [], keywords: ["courses", "e-learning"], priority: 3},
  {name: "Membership platforms", description: "Member sign-up, plans and access control", target_categories: ["fitness_centre", "sports_centre", "yoga", "club"], problems_solved: [], keywords: ["membership"], priority: 4},
  {name: "Business automation applications", description: "Automate repetitive admin work", target_categories: [], problems_solved: ["manual processes"], keywords: ["automation"], priority: 3},
  {name: "Custom web development", description: "Anything bespoke that fits no other category", target_categories: [], problems_solved: [], keywords: ["custom"], priority: 3},
];
