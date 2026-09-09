import { TextField } from '@budget-app/ui';

const SearchIcon = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="9" cy="9" r="6" />
    <path d="M13.5 13.5L17 17" />
  </svg>
);

export const Basic = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <TextField label="Merchant" placeholder="e.g. Whole Foods" fullWidth />
    <TextField label="Note" hint="Optional - shows on the transaction" defaultValue="Weekly shop" fullWidth />
  </div>
);

export const ErrorState = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <TextField label="Email" type="email" defaultValue="priya@" error="Enter a valid email address" fullWidth />
  </div>
);

export const Adornments = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <TextField label="Search transactions" hideLabel type="search" placeholder="Search transactions" prefix={<SearchIcon />} fullWidth />
    <TextField label="Daily target" defaultValue="150" suffix="per day" fullWidth />
  </div>
);

export const Sizes = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <TextField label="Small" size="sm" placeholder="32px" fullWidth />
    <TextField label="Medium" size="md" placeholder="40px" fullWidth />
    <TextField label="Large" size="lg" placeholder="48px" fullWidth />
  </div>
);

export const Disabled = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <TextField label="Household name" defaultValue="The Okafors" disabled fullWidth />
  </div>
);
