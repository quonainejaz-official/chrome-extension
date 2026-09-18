// Shared outline icon aliases backed by Lucide.
// Keeping the local names avoids churn in feature components while giving the
// whole side panel one consistent, theme-friendly icon language.
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleX,
  CircleHelp,
  Clock3,
  Code2,
  Compass,
  Cookie,
  Copy,
  FileText,
  Globe2,
  Hand,
  Keyboard,
  KeyRound,
  Languages,
  Lightbulb,
  List,
  Maximize2,
  Minimize2,
  Menu,
  Moon,
  MousePointer2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  SquareCheckBig,
  Sun,
  Trash2,
  Undo2,
  UserRound,
  Scale,
  Workflow,
  FormInput,
  Zap,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

export type IconProps = LucideProps;

const outline = (Icon: LucideIcon) => {
  const OutlineIcon = (props: IconProps) => (
    <Icon {...props} strokeWidth={props.strokeWidth ?? 1.75} />
  );
  OutlineIcon.displayName = `Outline${Icon.displayName ?? 'Icon'}`;
  return OutlineIcon;
};

export const MenuIcon = outline(Menu);
export const CloseIcon = outline(X);
export const RefreshIcon = outline(RefreshCw);
export const SunIcon = outline(Sun);
export const MoonIcon = outline(Moon);
export const SettingsIcon = outline(Settings);
export const DocumentIcon = outline(FileText);
export const SendIcon = outline(Send);
export const CopyIcon = outline(Copy);
export const CheckIcon = outline(Check);
export const PlusIcon = outline(Plus);
export const TrashIcon = outline(Trash2);
export const ChevronDownIcon = outline(ChevronDown);
export const BackIcon = outline(ChevronLeft);
export const SparkleIcon = outline(Sparkles);
export const AlertIcon = outline(AlertTriangle);
export const HandIcon = outline(Hand);
export const StopIcon = outline(Square);
export const ShieldIcon = outline(ShieldCheck);
export const UserIcon = outline(UserRound);
export const XCircleIcon = outline(CircleX);
export const CursorIcon = outline(MousePointer2);
export const KeyboardIcon = outline(Keyboard);
export const ListIcon = outline(List);
export const CheckboxIcon = outline(SquareCheckBig);
export const ScrollIcon = outline(ArrowDown);
export const NavigateIcon = outline(ArrowRight);
export const SubmitIcon = outline(Send);
export const ClockIcon = outline(Clock3);
export const GlobeIcon = outline(Globe2);
export const SearchIcon = outline(Search);
export const UndoIcon = outline(Undo2);
export const BookOpenIcon = outline(BookOpen);
export const CircleHelpIcon = outline(CircleHelp);
export const CodeIcon = outline(Code2);
export const CompassIcon = outline(Compass);
export const CookieIcon = outline(Cookie);
export const FormInputIcon = outline(FormInput);
export const KeyIcon = outline(KeyRound);
export const LanguagesIcon = outline(Languages);
export const LightbulbIcon = outline(Lightbulb);
export const MaximizeIcon = outline(Maximize2);
export const MinimizeIcon = outline(Minimize2);
export const ScaleIcon = outline(Scale);
export const WorkflowIcon = outline(Workflow);
export const ZapIcon = outline(Zap);
