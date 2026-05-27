import logo from "@/assets/payticket-logo.jpeg";

type Props = {
  width?: number;
  height?: number;
  className?: string;
};

export const BrandLogo = ({ width = 96, height = 72, className = "" }: Props) => (
  <div className={`flex items-center justify-center ${className}`}>
    <img
      src={logo}
      alt="Logo"
      width={width}
      height={height}
      className="rounded-xl object-contain shadow-soft-sm"
      style={{ width, height }}
    />
  </div>
);

export default BrandLogo;