// Each icon carries its own fixed `style="color:#hex"` (from the user's
// supplied icon set) — .side-ic's `stroke: currentColor` (Sidebar.css) picks
// that up directly on the same element, so the icon keeps its own category
// color regardless of the nav item's hover/active state (which still
// changes background + text color as before).
export const IC = {
  daily: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#8B5CF6"><path d="M6 2.5h8l4 4V21H6a2 2 0 0 1-2-2V4.5a2 2 0 0 1 2-2z"/><path d="M14 2.5V7h4"/><path d="M8 11h6M8 15h4M8 19h7"/></svg>',
  week: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#7C3AED"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 9h18"/><path d="M7 13h3v3H7zM14 13h3v3h-3z"/></svg>',
  month: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#6D4CC2"><rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M7 2.5v4M17 2.5v4M3 9h18"/><path d="M7 13h10M7 16.5h7"/></svg>',
  annual: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#5B3FA8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/><path d="M7.5 5.5 9 7M16.5 5.5 15 7"/></svg>',
  reports: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#7652C8"><path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/></svg>',
  portfolio: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#EC4899"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m5.5 17 4-4 3 3 2-2 4 4"/><path d="m18 2 .6 1.4L20 4l-1.4.6L18 6l-.6-1.4L16 4l1.4-.6L18 2z"/></svg>',
  clients: '<svg class="side-ic" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 6.2a3 3 0 0 1 0 5.6"/><path d="M17.5 20a5.3 5.3 0 0 0-3-4.8"/></svg>',
  create: '<svg class="side-ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  compare: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#3B82F6"><path d="M7 7h11"/><path d="m15 4 3 3-3 3"/><path d="M17 17H6"/><path d="m9 14-3 3 3 3"/></svg>',
  history: '<svg class="side-ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></svg>',
  deptSales: '<svg class="side-ic" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  deptPM: '<svg class="side-ic" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3"/><path d="M8 11h8M8 15h5"/></svg>',
  deptTools: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#64748B"><path d="M14.7 6.3a4 4 0 0 0-5-5l2.1 2.1-2.8 2.8L6.9 4.1a4 4 0 0 0 5 5L20 17.2a2 2 0 1 1-2.8 2.8L9.1 11.9"/><path d="m5 13-3 3 6 6 3-3"/></svg>',
  deptAutomation: '<svg class="side-ic" viewBox="0 0 24 24"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  constellation: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#A855F7"><circle cx="12" cy="12" r="2.2"/><circle cx="4" cy="6" r="1.6"/><circle cx="20" cy="6" r="1.6"/><circle cx="4" cy="18" r="1.6"/><circle cx="20" cy="18" r="1.6"/><path d="M12 12 4 6M12 12l16-6M12 12 4 18M12 12l8 6"/></svg>',
  followup: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#D946EF"><path d="M4 5h11a4 4 0 0 1 4 4v4"/><path d="m16 10 3 3 3-3"/><path d="M4 9v8a2 2 0 0 0 2 2h9"/><path d="m9 12 .6 1.4 1.4.6-1.4.6L9 16l-.6-1.4L7 14l1.4-.6L9 12z"/></svg>',
  funnel: '<svg class="side-ic" viewBox="0 0 24 24"><path d="M4 4h16l-6.5 8v6l-3 1.5v-7.5z"/></svg>',

  // New keys — see plan for why each moves off a previously-shared icon.
  dashboard: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#7C3AED"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="4.5" rx="1.5"/><rect x="14" y="10.5" width="7" height="10.5" rx="1.5"/><rect x="3" y="13" width="7" height="8" rx="1.5"/></svg>',
  aiDaily: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#A855F7"><path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v4h4"/><path d="m10 10 .7 1.8 1.8.7-1.8.7L10 15l-.7-1.8-1.8-.7 1.8-.7L10 10z"/><path d="M8 18h6"/></svg>',
  aiWeek: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#9333EA"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 9h18"/><path d="m12 11 .7 1.8 1.8.7-1.8.7L12 16l-.7-1.8-1.8-.7 1.8-.7L12 11z"/></svg>',
  aiMonth: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#7E22CE"><rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M7 2.5v4M17 2.5v4M3 9h18"/><path d="m12 11 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z"/><path d="M8 18.5h8"/></svg>',
  teamCalendar: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#14B8A6"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 9h18"/><circle cx="9" cy="14" r="2"/><path d="M6 19a3 3 0 0 1 6 0"/><path d="M15 13h3M15 16h3"/></svg>',
  clientsReport: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#8B5CF6"><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M15 8.5h5M15 12h4M15 15.5h3"/></svg>',
  calculator: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#0EA5E9"><rect x="5" y="2.5" width="14" height="19" rx="2"/><rect x="8" y="5.5" width="8" height="3.5" rx="1"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"/></svg>',
  account: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#6366F1"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>',
  salesTasks: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#7C3AED"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h.01M8 12h.01M8 16h.01"/><path d="M11.5 8h5M11.5 12h5M11.5 16h5"/></svg>',
  myTasks: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#2F80ED"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>',
  deals: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#B8860B"><path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4z"/></svg>',
  // Was a duplicate of `reports` (the same icon as Reports Manager) —
  // projects get their own folder icon instead.
  projects: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#7652C8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
  // Was the generic Tools wrench icon, shared with the unrelated Tools
  // department — accounts/credentials get an id-card icon instead.
  teamAccounts: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#64748B"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M6 16a2.5 2.5 0 0 1 5 0"/><path d="M13.5 10h5M13.5 13h5"/></svg>',
  teamMembers: '<svg class="side-ic" viewBox="0 0 24 24" style="color:#0D9488"><circle cx="9" cy="7" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17.5" cy="8" r="2.4"/><path d="M14.8 20a4.4 4.4 0 0 1 6.7-3.6"/></svg>',
};

export function iconOnly(svgStr) {
  return svgStr.replace('class="side-ic" ', '');
}
