import type { ImgHTMLAttributes } from 'react';
export default function Image(props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) {
    const { unoptimized: _unoptimized, ...imageProps } = props;
    return <img {...imageProps} />;
}
