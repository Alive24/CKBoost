import { Home, MessageSquare, Target, Trophy } from "lucide-react";
import React from "react";

export default {
  revamp: {
    display: "hidden",
  },
  index: {
    type: "page",
    display: "hidden",
  },
  // Use the /docs route only as a container,
  // and show its children directly in the sidebar
  docs: {
    display: "children",
  },
  campaigns: {
    type: "page",
    title: (
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4" />
        Campaigns
      </div>
    ),
    href: "/",
  },
  leaderboard: {
    type: "page",
    title: (
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4" />
        Leaderboard
      </div>
    ),
    href: "/leaderboard",
  },
  tipping: {
    type: "page",
    title: (
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        Tipping
      </div>
    ),
    href: "/tipping",
  },
  dashboard: {
    type: "page",
    title: (
      <div className="flex items-center gap-2">
        <Home className="h-4 w-4" />
        Dashboard
      </div>
    ),
    href: "/dashboard",
  },
  "campaign-admin": {
    type: "page",
    display: "hidden",
  },
  identity: {
    type: "page",
    display: "hidden",
  },
  "platform-admin": {
    type: "page",
    display: "hidden",
  },
  profile: {
    type: "page",
    display: "hidden",
  },
};
