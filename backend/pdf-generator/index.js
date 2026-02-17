const express = require('express');
const cors = require('cors');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Helper: Convert hex color to RGB (0-1 range)
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  };
}

// Helper: Truncate text to fit width
function truncateText(text, font, fontSize, maxWidth) {
  if (!text) return '';
  let truncated = text;
  while (truncated.length > 0 && font.widthOfTextAtSize(truncated, fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  if (truncated.length < text.length && truncated.length > 3) {
    truncated = truncated.slice(0, -3) + '...';
  }
  return truncated;
}

// Draw PKI Logo (simplified 3D cube)
function drawPkiLogo(page, x, y, width, height, fonts) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const cubeSize = Math.min(width, height) * 0.5;

  // Colors for cube faces
  const frontColor = hexToRgb('#8B4789');  // Purple
  const topColor = hexToRgb('#D4A5D4');    // Light pink
  const sideColor = hexToRgb('#A87FA8');   // Medium purple

  // Cube dimensions
  const offset = cubeSize * 0.3;
  const halfCube = cubeSize / 2;

  // Front face (rectangle)
  page.drawRectangle({
    x: centerX - halfCube,
    y: centerY - halfCube - offset / 2,
    width: cubeSize,
    height: cubeSize,
    color: rgb(frontColor.r, frontColor.g, frontColor.b),
  });

  // Top face (parallelogram as rectangle approximation)
  page.drawRectangle({
    x: centerX - halfCube + offset / 2,
    y: centerY + halfCube - offset / 2,
    width: cubeSize,
    height: offset,
    color: rgb(topColor.r, topColor.g, topColor.b),
  });

  // Side face
  page.drawRectangle({
    x: centerX + halfCube,
    y: centerY - halfCube - offset / 2,
    width: offset,
    height: cubeSize,
    color: rgb(sideColor.r, sideColor.g, sideColor.b),
  });

  // PKI text
  const pkiFontSize = cubeSize * 0.25;
  const pkiText = 'PKI';
  const pkiWidth = fonts.bold.widthOfTextAtSize(pkiText, pkiFontSize);

  page.drawText(pkiText, {
    x: centerX - pkiWidth / 2,
    y: centerY - pkiFontSize / 2,
    size: pkiFontSize,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });

  // SERVICES text below cube
  const servicesFontSize = pkiFontSize * 0.5;
  const servicesText = 'SERVICES';
  const servicesWidth = fonts.regular.widthOfTextAtSize(servicesText, servicesFontSize);

  page.drawText(servicesText, {
    x: centerX - servicesWidth / 2,
    y: y + height * 0.1,
    size: servicesFontSize,
    font: fonts.regular,
    color: rgb(0.2, 0.2, 0.2),
  });
}

// Main seal drawing function
async function drawSignatureSeal(certData, width = 200, height = 150) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([width, height]);

  // Load fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular: helvetica, bold: helveticaBold };

  // Colors
  const borderColor = hexToRgb('#000000');
  const bgColor = hexToRgb('#FFFFFF');
  const dividerColor = hexToRgb('#CCCCCC');
  const textDark = hexToRgb('#333333');
  const textMedium = hexToRgb('#666666');

  // Background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: width,
    height: height,
    color: rgb(bgColor.r, bgColor.g, bgColor.b),
  });

  // Border
  page.drawRectangle({
    x: 0,
    y: 0,
    width: width,
    height: height,
    borderColor: rgb(borderColor.r, borderColor.g, borderColor.b),
    borderWidth: 1,
  });

  // Layout: 30% logo, 70% info
  const logoWidth = width * 0.3;
  const infoWidth = width * 0.7;
  const padding = 5;

  // Vertical divider
  page.drawLine({
    start: { x: logoWidth, y: padding },
    end: { x: logoWidth, y: height - padding },
    thickness: 1,
    color: rgb(dividerColor.r, dividerColor.g, dividerColor.b),
  });

  // Draw PKI Logo
  drawPkiLogo(page, 0, 0, logoWidth, height, fonts);

  // Info section
  const infoX = logoWidth + padding;
  const maxTextWidth = infoWidth - padding * 2;

  // Calculate font sizes based on height
  const baseFontSize = Math.max(6, Math.min(12, height * 0.08));
  const smallFontSize = baseFontSize * 0.85;

  // Extract cert data
  const issuer = certData.issuer_common_name || 'PKI Services';
  const timestamp = certData.timestamp_local || certData.timestamp_iso || '';
  const country = certData.country || '';
  const signer = certData.subject_common_name || '';

  // Draw text lines
  let currentY = height - padding - baseFontSize;

  // Issuer (bold)
  const truncatedIssuer = truncateText(issuer, helveticaBold, baseFontSize, maxTextWidth);
  page.drawText(truncatedIssuer, {
    x: infoX,
    y: currentY,
    size: baseFontSize,
    font: helveticaBold,
    color: rgb(textDark.r, textDark.g, textDark.b),
  });
  currentY -= baseFontSize * 1.3;

  // Timestamp
  const truncatedTimestamp = truncateText(timestamp, helvetica, smallFontSize, maxTextWidth);
  page.drawText(truncatedTimestamp, {
    x: infoX,
    y: currentY,
    size: smallFontSize,
    font: helvetica,
    color: rgb(textMedium.r, textMedium.g, textMedium.b),
  });
  currentY -= smallFontSize * 1.5;

  // "FIRMADO DIGITALMENTE"
  const signedText = 'FIRMADO DIGITALMENTE';
  const truncatedSigned = truncateText(signedText, helveticaBold, baseFontSize, maxTextWidth);
  page.drawText(truncatedSigned, {
    x: infoX,
    y: currentY,
    size: baseFontSize,
    font: helveticaBold,
    color: rgb(textDark.r, textDark.g, textDark.b),
  });
  currentY -= baseFontSize * 1.3;

  // Signer name
  if (signer) {
    const truncatedSigner = truncateText(signer, helvetica, smallFontSize, maxTextWidth);
    page.drawText(truncatedSigner, {
      x: infoX,
      y: currentY,
      size: smallFontSize,
      font: helvetica,
      color: rgb(textMedium.r, textMedium.g, textMedium.b),
    });
    currentY -= smallFontSize * 1.3;
  }

  // Country
  if (country) {
    const truncatedCountry = truncateText(country, helvetica, smallFontSize, maxTextWidth);
    page.drawText(truncatedCountry, {
      x: infoX,
      y: currentY,
      size: smallFontSize,
      font: helvetica,
      color: rgb(textMedium.r, textMedium.g, textMedium.b),
    });
  }

  return await pdfDoc.save();
}

// Endpoint: Generate seal
app.post('/generate-seal', async (req, res) => {
  try {
    const { cert_data, width = 200, height = 150 } = req.body;

    if (!cert_data) {
      return res.status(400).json({ error: 'cert_data is required' });
    }

    const pdfBytes = await drawSignatureSeal(cert_data, width, height);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBytes.length,
    });
    res.send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('Error generating seal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pdf-generator' });
});

app.listen(PORT, () => {
  console.log(`PDF Generator service running on port ${PORT}`);
});
