import { BadRequestException } from '@nestjs/common';
import JSZip from 'jszip';
import { ThemePackagesService } from './theme-packages.service';

function uploadFile(buffer: Buffer, name = 'theme.zip'): Express.Multer.File {
  return {
    buffer,
    originalname: name,
    fieldname: 'file',
    encoding: '7bit',
    mimetype: 'application/zip',
    size: buffer.length,
    destination: '',
    filename: name,
    path: '',
    stream: undefined as any,
  };
}

async function makeZip(files: Record<string, string | Buffer>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, contents] of Object.entries(files)) zip.file(path, contents);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('ThemePackagesService', () => {
  const prisma = {
    addonDefinition: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new ThemePackagesService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('extracts CSS and inlines referenced package assets', async () => {
    const zip = await makeZip({
      'modern/style.css': '.hero { background: url(assets/bg.png); }',
      'modern/assets/bg.png': Buffer.from('image-content'),
    });

    const css = await service.extractCssFromZip(uploadFile(zip));

    expect(css).toContain('url(data:image/png;base64,');
    expect(css).not.toContain('assets/bg.png');
  });

  it('rejects external asset URLs', async () => {
    const zip = await makeZip({ 'style.css': '.hero { background: url(https://example.com/bg.png); }' });

    await expect(service.extractCssFromZip(uploadFile(zip))).rejects.toThrow(BadRequestException);
  });

  it('rejects unsupported package files', async () => {
    const zip = await makeZip({ 'style.css': ':root { --brand: #123456; }', 'script.js': 'alert(1)' });

    await expect(service.extractCssFromZip(uploadFile(zip))).rejects.toThrow('Unsupported theme package file');
  });

  it('rejects packages without exactly one stylesheet', async () => {
    const zip = await makeZip({ 'screenshot.png': Buffer.from('image') });

    await expect(service.extractCssFromZip(uploadFile(zip))).rejects.toThrow('exactly one style.css');
  });

  it('stores validated ZIP CSS on a theme listing', async () => {
    prisma.addonDefinition.findUnique.mockResolvedValue({
      id: 'theme-1',
      kind: 'THEME',
      themeConfig: { mode: 'light', primaryColor: '#123456' },
    });
    prisma.addonDefinition.update.mockResolvedValue({ id: 'theme-1' });
    const zip = await makeZip({ 'style.css': ':root { --brand: #123456; }' });

    await service.applyZipToAddon('theme-1', uploadFile(zip));

    expect(prisma.addonDefinition.update).toHaveBeenCalledWith({
      where: { id: 'theme-1' },
      data: {
        themeConfig: {
          mode: 'light',
          primaryColor: '#123456',
          customCss: ':root { --brand: #123456; }',
        },
      },
    });
  });
});
