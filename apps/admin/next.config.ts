import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    unoptimized: true,
    domains: [
      "tps-storage.s3.ap-south-1.amazonaws.com",
      "content.jdmagicbox.com",
      "encrypted-tbn0.gstatic.com",
      "logowik.com",
      "images.moneycontrol.com",
      "upload.wikimedia.org",
      "logodownload.org",
      "pngimg.com",
      "media.licdn.com",
      "productspaceorgin.wordpress.com",
      "substackcdn.com",
      "static.licdn.com",
      "beta-api.theproductspace.in",
      "lh3.googleusercontent.com"
    ],
  },
};

export default nextConfig;
