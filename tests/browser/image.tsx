import type { ImgHTMLAttributes } from 'react';
export default function Image(props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; fill?: boolean }) {
    const { unoptimized: _unoptimized, fill, style, ...imageProps } = props;
    return <img {...imageProps} style={fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style } : style} />;
}
