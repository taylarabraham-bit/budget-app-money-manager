/**
 * @budget-app/ui - household budget design system.
 *
 * Import the stylesheet once (`@budget-app/ui/styles.css`) and wrap screens
 * in `.bdg-app`; every component below is a plain React component styled by
 * `--bdg-*` tokens and `bdg-*` classes.
 */

// Actions
export { Button } from './components/actions/Button/Button';
export type { ButtonProps } from './components/actions/Button/Button';

// Forms
export { TextField } from './components/forms/TextField/TextField';
export type { TextFieldProps } from './components/forms/TextField/TextField';
export { AmountInput } from './components/forms/AmountInput/AmountInput';
export type { AmountInputProps } from './components/forms/AmountInput/AmountInput';
export { Select } from './components/forms/Select/Select';
export type { SelectProps, SelectOption } from './components/forms/Select/Select';
export { Checkbox } from './components/forms/Checkbox/Checkbox';
export type { CheckboxProps } from './components/forms/Checkbox/Checkbox';
export { Switch } from './components/forms/Switch/Switch';
export type { SwitchProps } from './components/forms/Switch/Switch';

// Layout
export { Card } from './components/layout/Card/Card';
export type { CardProps } from './components/layout/Card/Card';
export { PageHeader } from './components/layout/PageHeader/PageHeader';
export type { PageHeaderProps } from './components/layout/PageHeader/PageHeader';

// Household
export { Avatar } from './components/household/Avatar/Avatar';
export type { AvatarProps } from './components/household/Avatar/Avatar';
export { MemberChip } from './components/household/MemberChip/MemberChip';
export type { MemberChipProps } from './components/household/MemberChip/MemberChip';

// Feedback
export { Badge } from './components/feedback/Badge/Badge';
export type { BadgeProps } from './components/feedback/Badge/Badge';
export { ProgressBar } from './components/feedback/ProgressBar/ProgressBar';
export type { ProgressBarProps } from './components/feedback/ProgressBar/ProgressBar';
export { Alert } from './components/feedback/Alert/Alert';
export type { AlertProps } from './components/feedback/Alert/Alert';
export { EmptyState } from './components/feedback/EmptyState/EmptyState';
export type { EmptyStateProps } from './components/feedback/EmptyState/EmptyState';

// Finance
export { Amount } from './components/finance/Amount/Amount';
export type { AmountProps } from './components/finance/Amount/Amount';
export { StatCard } from './components/finance/StatCard/StatCard';
export type { StatCardProps } from './components/finance/StatCard/StatCard';
export { BudgetBar } from './components/finance/BudgetBar/BudgetBar';
export type { BudgetBarProps } from './components/finance/BudgetBar/BudgetBar';
export { GoalCard } from './components/finance/GoalCard/GoalCard';
export type { GoalCardProps } from './components/finance/GoalCard/GoalCard';
export { TransactionItem } from './components/finance/TransactionItem/TransactionItem';
export type { TransactionItemProps } from './components/finance/TransactionItem/TransactionItem';
export { TransactionList } from './components/finance/TransactionList/TransactionList';
export type { TransactionListProps, Transaction } from './components/finance/TransactionList/TransactionList';
export { TrendBars } from './components/finance/TrendBars/TrendBars';
export type { TrendBarsProps, TrendPoint } from './components/finance/TrendBars/TrendBars';

// Navigation
export { Tabs } from './components/navigation/Tabs/Tabs';
export type { TabsProps, TabItem } from './components/navigation/Tabs/Tabs';
export { BottomNav } from './components/navigation/BottomNav/BottomNav';
export type { BottomNavProps, BottomNavItem } from './components/navigation/BottomNav/BottomNav';

// Overlay
export { Dialog, closeTopDialog, openDialogCount } from './components/overlay/Dialog/Dialog';
export type { DialogProps } from './components/overlay/Dialog/Dialog';

// Helpers + shared types (lowercase: never treated as components)
export { formatMoney, formatMoneyAuto, splitMoney, currencySymbol, currencyFractionDigits, moneyDisplayValue, formatPercent, initialsOf, memberColorFor, formatDayLabel, parseIsoDate } from './lib/format';
export type { FormatMoneyOptions, FormatPercentOptions } from './lib/format';
export { MEMBER_COLORS } from './lib/types';
export type { Size, Tone, MemberColor, Member } from './lib/types';
