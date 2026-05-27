import logo from "@/assets/payticket-logo.jpeg";

type Props = {
  size?: number;
  className?: string;
};

export const BrandLogo = ({ size = 72, className = "" }: Props) => (
  <div className={`flex items-center justify-center ${className}`}>
    <img
      src={logo}
      alt="Logo"
      width={size}
      height={size}
      className="rounded-xl object-cover shadow-soft-sm"
      style={{ width: size, height: size }}
    />
  </div>
);

export default BrandLogo;