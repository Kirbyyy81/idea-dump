import { ReactNode, SVGProps } from 'react';

export type DoodleIconProps = SVGProps<SVGSVGElement> & {
    size?: number | string;
};

const sharedProps = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.9,
    viewBox: '0 0 24 24',
};

function DoodleIcon({ children, size = 20, ...props }: DoodleIconProps & { children: ReactNode }) {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            width={size}
            height={size}
            {...sharedProps}
            {...props}
        >
            {children}
        </svg>
    );
}

export function SourceDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M4.2 7.6c.2-1.5 1.4-2.4 3-2.3l11.1.8c1 .1 1.7.8 1.6 1.8l-.8 9.1c-.1 1.1-.9 1.7-2 1.7H6.4c-1.4 0-2.3-.9-2.2-2.2Z" />
            <path d="M4.6 9.2h13.8c1.1 0 1.7.6 1.7 1.6v3.3h-4.6c-1.2 0-2-.8-2-1.9s.8-1.9 2-1.9h4.3" />
            <path d="M15.8 12.2h.1" />
        </DoodleIcon>
    );
}

export function CategoryDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M4.1 5.2c0-.7.5-1.2 1.2-1.2h6.1l8.4 8.3c.5.5.5 1.3 0 1.8l-5.7 5.7c-.5.5-1.3.5-1.8 0L4 11.4Z" />
            <path d="M8 8.1h.1" />
        </DoodleIcon>
    );
}

export function BackDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M10.1 5.2 3.8 11.7l6.1 6.5" />
            <path d="M4.3 11.7c4.2-.4 8.2-.2 15.3.3" />
        </DoodleIcon>
    );
}

export function PreviousDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="m14.8 4.7-7 7.1 7.3 7.4" />
        </DoodleIcon>
    );
}

export function NextDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="m9.1 4.8 7.2 7-7 7.3" />
        </DoodleIcon>
    );
}

export function AddDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M12.2 4.1c-.2 4.8-.2 10.3.1 15.7" />
            <path d="M4.4 12.3c5.3-.4 10.1-.3 15.4 0" />
        </DoodleIcon>
    );
}

export function IncomeDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M5 5.2c4.1 4.2 8.1 8.1 13.9 13.4" />
            <path d="m11.8 18.6 7.2.2-.1-7.2" />
        </DoodleIcon>
    );
}

export function ExpenseDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M5.1 18.7c4.1-4.4 8.3-8.6 13.7-13.5" />
            <path d="m11.7 5.2 7.2-.1-.2 7.3" />
        </DoodleIcon>
    );
}

export function DocumentDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M6 3.8c2.9-.2 6.1-.1 9 .2l3 3.2c.3 4.6.2 8.8-.2 12.8-3.8.3-7.7.2-11.8-.1-.3-5.2-.3-10.8 0-16.1Z" />
            <path d="M14.8 4.2c0 1.4 0 2.5.2 3.5 1 .1 1.9 0 2.8-.1M8.6 11.2c2.3-.2 4.5-.1 6.8.1M8.7 14.7c1.8-.2 3.9-.1 6 .1" />
        </DoodleIcon>
    );
}

export function ScanDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M8.1 4H5.5C4.6 4 4 4.6 4 5.5v2.7M15.9 4h2.6c.9 0 1.5.6 1.5 1.5v2.7M20 15.7v2.8c0 .9-.6 1.5-1.5 1.5h-2.7M8.2 20H5.5c-.9 0-1.5-.6-1.5-1.5v-2.7" />
            <path d="M7.4 12.1c3-.3 6.1-.3 9.3 0M9.2 8.6c1.8-.2 3.8-.2 5.7 0M9.1 15.5c1.9-.2 3.8-.2 5.7 0" />
        </DoodleIcon>
    );
}

export function CheckDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M4.5 12.3c1.8 2 3.5 3.7 5.2 5.1 3.1-4.3 6.1-8.1 9.9-11.3" />
        </DoodleIcon>
    );
}

export function RulesDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M4 6.2c4.7-.3 9.9-.3 16 0M4 12.1c5.3-.2 10.6-.2 16 .1M4 18c4.8-.3 10.1-.2 16 .1" />
            <path d="M8.2 3.9c.8 1.3.7 3.1-.1 4.5M15.6 9.8c-.8 1.4-.8 3 .1 4.7M10.4 15.8c.8 1.4.7 2.9-.1 4.5" />
        </DoodleIcon>
    );
}

export function SparkleDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M11.2 3.7c.5 3.9 2.2 6 5.5 7.3-3.5.7-5.4 2.7-6.2 6.1-.6-3.4-2.3-5.4-5.6-6.6 3.5-.7 5.5-2.7 6.3-6.8Z" />
            <path d="M18.5 4.5h.1M18.9 17.7c.2 1 .7 1.6 1.5 2-.9.2-1.5.7-1.8 1.5-.2-.8-.7-1.4-1.5-1.7.9-.2 1.5-.7 1.8-1.8Z" />
        </DoodleIcon>
    );
}

export function DeleteDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M5.2 7.2c4.7-.3 9.2-.3 13.7.1M9 6.8l.4-2.4c1.7-.3 3.4-.3 5.2 0l.5 2.5" />
            <path d="m7.2 8.2.8 11c2.7.5 5.2.5 8-.1l.8-10.9M10.3 10.5l.3 5.8M13.8 10.4l-.2 6" />
        </DoodleIcon>
    );
}

export function CloseDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M5.4 5.1c4.1 4.5 8.5 8.9 13.3 13.7M18.8 5.3C14.2 9.8 9.9 14.2 5.2 18.8" />
        </DoodleIcon>
    );
}

export function WarningDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M11.2 3.9c.4-.7 1.3-.7 1.7 0l7.1 13c.5.9-.1 1.8-1 1.8H5c-1 0-1.6-1-1.1-1.8Z" />
            <path d="M12 8.2c-.1 2.1-.1 4.1.1 6.1M12 16.7h.1" />
        </DoodleIcon>
    );
}

export function RefreshDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M18.5 7.8c-1.6-2.6-4.7-4-7.8-3.3-3 .7-5.1 3-5.5 5.9" />
            <path d="m16 4.3 2.8 3.8 1.5-4.3M5.4 16.1c1.8 2.6 4.9 3.9 8 3.1 2.9-.7 4.9-3 5.3-5.8" />
            <path d="m7.9 19.6-2.8-3.8-1.4 4.3" />
        </DoodleIcon>
    );
}

export function OcrDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="M7.1 3.8H4.8c-.6 0-1 .4-1 1v2.5M16.9 3.8h2.3c.6 0 1 .4 1 1v2.5M20.2 16.8v2.4c0 .6-.4 1-1 1h-2.4M7.2 20.2H4.8c-.6 0-1-.4-1-1v-2.4" />
            <path d="M7.7 8.1c2.9-.3 5.7-.2 8.6.1M7.6 11.9c2.8-.2 5.8-.1 8.7.1M7.8 15.7c2-.2 4.2-.1 6.5.1" />
        </DoodleIcon>
    );
}

export function EditDoodleIcon(props: DoodleIconProps) {
    return (
        <DoodleIcon {...props}>
            <path d="m5.1 15.6-1 4.3 4.4-1.1L19 8.1c.8-.8.8-1.7 0-2.5l-.7-.7c-.8-.8-1.7-.7-2.5.1Z" />
            <path d="m13.9 6.9 3.2 3.1M5.5 15.4l3.1 3" />
        </DoodleIcon>
    );
}
