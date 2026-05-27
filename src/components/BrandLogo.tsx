import logo from "@/assets/payticket-logo.jpeg";

type Props = {
  size?: number;
  className?: string;
  showName?: boolean;
  nameClassName?: string;
};

export const BrandLogo = ({ size = 56, className = "", showName = true, nameClassName = "" }: Props) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <img
      src={logo}
      alt="PayTicket"
      width={size}
      height={size}
      className="rounded-xl object-cover shadow-soft-sm"
      style={{ width: size, height: size }}
    />
    {showName && (
      <span className={`font-display font-bold tracking-tight ${nameClassName || "text-2xl"}`}>
        PayTicket
      </span>
    )}
  </div>
);

export default BrandLogo;