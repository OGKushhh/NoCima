import ReactNativeBlobUtil from 'react-native-blob-util';

export const getPlatformPath = (path: string): string => {
  if (path.startsWith('file://')) {
    return path;
  }
  return path;
};

export const readTextFile = async (filePath: string): Promise<string> => {
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(filePath);
    if (!exists) {
      throw new Error(`File not found: ${filePath}`);
    }
    return await ReactNativeBlobUtil.fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw error;
  }
};

export const writeTextFile = async (
  filePath: string,
  content: string
): Promise<void> => {
  try {
    await ReactNativeBlobUtil.fs.writeFile(filePath, content, 'utf8');
  } catch (error) {
    throw error;
  }
};

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    return await ReactNativeBlobUtil.fs.exists(filePath);
  } catch {
    return false;
  }
};

export const getFileInfo = async (
  filePath: string
): Promise<{ size: number; lastModified: number }> => {
  try {
    const stat = await ReactNativeBlobUtil.fs.stat(filePath);
    return {
      size: parseInt(stat.size, 10) || 0,
      lastModified: stat.lastModified
        ? new Date(stat.lastModified).getTime()
        : Date.now(),
    };
  } catch {
    return { size: 0, lastModified: 0 };
  }
};

export const deleteFile = async (filePath: string): Promise<void> => {
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(filePath);
    if (exists) {
      await ReactNativeBlobUtil.fs.unlink(filePath);
    }
  } catch {
    // ignore
  }
};

export const ensureDir = async (dirPath: string): Promise<void> => {
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(dirPath);
    if (!exists) {
      await ReactNativeBlobUtil.fs.mkdir(dirPath);
    }
  } catch {
    // ignore
  }
};

export const downloadFile = async (
  url: string,
  savePath: string
): Promise<string> => {
  try {
    const result = await ReactNativeBlobUtil.config({
      path: savePath,
      fileCache: true,
    }).fetch('GET', url, {});
    return result.path();
  } catch (error) {
    throw error;
  }
};
