import { HugeiconsIcon, type HugeiconsIconProps, type IconSvgElement } from "@hugeicons/react";
import {
  Alert02Icon,
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowDown02Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowUp01Icon,
  ArrowUp02Icon,
  Bookmark02Icon,
  BracesIcon,
  BulbIcon,
  Cancel01Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ClipboardCopyIcon,
  ClipboardPasteIcon,
  ColorPickerIcon,
  Copy01Icon,
  CopyPlusIcon,
  CornerDownRightIcon,
  Database01Icon,
  DatabaseLightningIcon,
  Delete02Icon,
  Download04Icon,
  FileAddIcon,
  FileCodeIcon,
  FileDownloadIcon,
  FileUploadIcon,
  FilterIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  FullScreenIcon,
  GridViewIcon,
  HistoryIcon,
  Image01Icon,
  InformationCircleIcon,
  Key01Icon,
  Layout2RowIcon,
  Layout3ColumnIcon,
  Layout3RowIcon,
  Link02Icon,
  LinkSquare02Icon,
  ListPlusIcon,
  ListTreeIcon,
  Loading03Icon,
  Menu01Icon,
  MinusSignIcon,
  Moon02Icon,
  MoreHorizontalIcon,
  NetworkIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightIcon,
  PanelRightOpenIcon,
  PencilEdit02Icon,
  PencilRulerIcon,
  PinIcon,
  PinOffIcon,
  PlayIcon,
  PlusSignIcon,
  RefreshIcon,
  Search01Icon,
  SparklesIcon,
  SquareSlashIcon,
  SquareTerminalIcon,
  Sun03Icon,
  TableIcon,
  TablePropertiesIcon,
  Tick02Icon,
  UnavailableIcon,
  Undo03Icon,
  UndoIcon,
  UnfoldLessIcon,
  UnfoldMoreIcon,
  Unlink05Icon,
  Upload04Icon,
  ViewIcon,
  ViewOffSlashIcon,
  ZapIcon,
} from "@hugeicons/core-free-icons";

/** Props every app icon accepts: any SVG attribute plus Hugeicons' size and stroke options. */
export type IconProps = Omit<HugeiconsIconProps, "icon" | "altIcon" | "showAlt">;

/** Turns a Hugeicons glyph into a component: decorative (aria-hidden) unless given an accessible name. */
function icon(glyph: IconSvgElement, name: string) {
  function Icon(props: IconProps) {
    const labelled = props["aria-label"] !== undefined || props["aria-labelledby"] !== undefined;
    return (
      <HugeiconsIcon
        icon={glyph}
        aria-hidden={labelled ? undefined : true}
        role={labelled ? "img" : undefined}
        {...props}
      />
    );
  }
  Icon.displayName = name;
  return Icon;
}

// The app's icon set. Names describe the shape; the Hugeicons glyph behind each lives only here.
export const AlertCircle = icon(AlertCircleIcon, "AlertCircle");
export const ArrowDown = icon(ArrowDown02Icon, "ArrowDown");
export const ArrowRight = icon(ArrowRight02Icon, "ArrowRight");
export const ArrowUp = icon(ArrowUp02Icon, "ArrowUp");
export const Ban = icon(UnavailableIcon, "Ban");
export const Bookmark = icon(Bookmark02Icon, "Bookmark");
export const Braces = icon(BracesIcon, "Braces");
export const Check = icon(Tick02Icon, "Check");
export const CheckCircle = icon(CheckmarkCircle02Icon, "CheckCircle");
export const ChevronDown = icon(ArrowDown01Icon, "ChevronDown");
export const ChevronFirst = icon(ChevronFirstIcon, "ChevronFirst");
export const ChevronLast = icon(ChevronLastIcon, "ChevronLast");
export const ChevronLeft = icon(ArrowLeft01Icon, "ChevronLeft");
export const ChevronRight = icon(ArrowRight01Icon, "ChevronRight");
export const ChevronUp = icon(ArrowUp01Icon, "ChevronUp");
export const ChevronsDownUp = icon(UnfoldLessIcon, "ChevronsDownUp");
export const ChevronsUpDown = icon(UnfoldMoreIcon, "ChevronsUpDown");
export const ClipboardCopy = icon(ClipboardCopyIcon, "ClipboardCopy");
export const ClipboardPaste = icon(ClipboardPasteIcon, "ClipboardPaste");
export const Columns3 = icon(Layout3ColumnIcon, "Columns3");
export const Copy = icon(Copy01Icon, "Copy");
export const CopyPlus = icon(CopyPlusIcon, "CopyPlus");
export const CornerDownRight = icon(CornerDownRightIcon, "CornerDownRight");
export const Database = icon(Database01Icon, "Database");
export const DatabaseZap = icon(DatabaseLightningIcon, "DatabaseZap");
export const Download = icon(Download04Icon, "Download");
export const ExternalLink = icon(LinkSquare02Icon, "ExternalLink");
export const Eye = icon(ViewIcon, "Eye");
export const EyeOff = icon(ViewOffSlashIcon, "EyeOff");
export const FileCode = icon(FileCodeIcon, "FileCode");
export const FileDown = icon(FileDownloadIcon, "FileDown");
export const FilePlus = icon(FileAddIcon, "FilePlus");
export const FileUp = icon(FileUploadIcon, "FileUp");
export const Filter = icon(FilterIcon, "Filter");
export const FolderOpen = icon(FolderOpenIcon, "FolderOpen");
export const History = icon(HistoryIcon, "History");
export const Image = icon(Image01Icon, "Image");
export const Info = icon(InformationCircleIcon, "Info");
export const KeyRound = icon(Key01Icon, "KeyRound");
export const LayoutGrid = icon(GridViewIcon, "LayoutGrid");
export const Lightbulb = icon(BulbIcon, "Lightbulb");
export const Link = icon(Link02Icon, "Link");
export const ListPlus = icon(ListPlusIcon, "ListPlus");
export const ListTree = icon(ListTreeIcon, "ListTree");
export const Loader = icon(Loading03Icon, "Loader");
export const Maximize = icon(FullScreenIcon, "Maximize");
export const Menu = icon(Menu01Icon, "Menu");
export const Minus = icon(MinusSignIcon, "Minus");
export const Moon = icon(Moon02Icon, "Moon");
export const MoreHorizontal = icon(MoreHorizontalIcon, "MoreHorizontal");
export const Network = icon(NetworkIcon, "Network");
export const OctagonX = icon(CancelCircleIcon, "OctagonX");
export const PanelLeftClose = icon(PanelLeftCloseIcon, "PanelLeftClose");
export const PanelLeftOpen = icon(PanelLeftOpenIcon, "PanelLeftOpen");
export const PanelRight = icon(PanelRightIcon, "PanelRight");
export const PanelRightOpen = icon(PanelRightOpenIcon, "PanelRightOpen");
export const Pencil = icon(PencilEdit02Icon, "Pencil");
export const PencilRuler = icon(PencilRulerIcon, "PencilRuler");
export const Pin = icon(PinIcon, "Pin");
export const PinOff = icon(PinOffIcon, "PinOff");
export const Pipette = icon(ColorPickerIcon, "Pipette");
export const Play = icon(PlayIcon, "Play");
export const Plus = icon(PlusSignIcon, "Plus");
export const RefreshCw = icon(RefreshIcon, "RefreshCw");
export const RotateCcw = icon(UndoIcon, "RotateCcw");
export const Rows2 = icon(Layout2RowIcon, "Rows2");
export const Rows3 = icon(Layout3RowIcon, "Rows3");
export const Save = icon(FloppyDiskIcon, "Save");
export const Search = icon(Search01Icon, "Search");
export const Sparkles = icon(SparklesIcon, "Sparkles");
export const SquareSlash = icon(SquareSlashIcon, "SquareSlash");
export const SquareTerminal = icon(SquareTerminalIcon, "SquareTerminal");
export const Sun = icon(Sun03Icon, "Sun");
export const Table = icon(TableIcon, "Table");
export const TableProperties = icon(TablePropertiesIcon, "TableProperties");
export const Trash = icon(Delete02Icon, "Trash");
export const TriangleAlert = icon(Alert02Icon, "TriangleAlert");
export const Undo = icon(Undo03Icon, "Undo");
export const Unlink = icon(Unlink05Icon, "Unlink");
export const Upload = icon(Upload04Icon, "Upload");
export const X = icon(Cancel01Icon, "X");
export const Zap = icon(ZapIcon, "Zap");
