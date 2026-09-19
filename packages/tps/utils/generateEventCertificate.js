const { createCanvas, loadImage } = require("canvas");

const generateCertificateImage = async (templateConfig, userData) => {  
  const { templateImage, imageSize, fields } = templateConfig;
  
  // Create canvas with template image dimensions
  const canvas = createCanvas(imageSize.width, imageSize.height);
  const ctx = canvas.getContext('2d');
  
  // Load template image
  const imageBuffer = Buffer.from(templateImage.split(',')[1], 'base64');
  const templateImg = await loadImage(imageBuffer);
  
  // Draw template image
  ctx.drawImage(templateImg, 0, 0);
  
  // Prepare field values
  const fieldValues = {
    name: userData.name || 'Participant',
    date: userData.date || new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }),
    certificateId: userData.certificateId || `CERT-${Date.now()}`
  };
  
  // Draw text fields
  fields.forEach(field => {
    const value = fieldValues[field.id] || '';
    if (!value) return;
    
    const x = (field.x / 100) * imageSize.width;
    const y = (field.y / 100) * imageSize.height;
    
    ctx.font = `bold ${field.fontSize}px ${field.fontFamily}`;
    ctx.fillStyle = field.color;
    ctx.textAlign = field.alignment || 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    ctx.shadowBlur = 4;
    
    ctx.fillText(value, x, y);
    
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  });
  
  return canvas.toBuffer('image/png');
};

// Export functions
module.exports = {generateCertificateImage};
