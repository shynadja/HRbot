import * as Icons from 'lucide-react';

const Icon = ({ name, size = 20, color = '#229ED9', ...props }) => {
  const LucideIcon = Icons[name];
  
  if (!LucideIcon) return null;
  
  return <LucideIcon size={size} color={color} {...props} />;
};

export default Icon;