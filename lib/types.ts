// Shared domain types. Kept framework-agnostic so they can be imported by
// server components, server actions, and client components alike.

export interface SizeOption {
  size: string;
  inStock: boolean;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  images: string[];
  sizes: SizeOption[];
}

export interface MerchItem {
  id: string;
  name: string;
  price: number;
  image: string;
  sizes: string[];
}

export interface Organizer {
  id: string;
  name: string;
  image: string;
  heroImage: string;
  merch: MerchItem[];
}

// What the client is allowed to send to the server when checking out.
// Note the deliberate absence of `price` — the server prices the cart.
export interface CartLine {
  id: string;
  size: string;
  quantity: number;
}
