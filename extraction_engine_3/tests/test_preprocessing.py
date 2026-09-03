from PIL import Image, ImageDraw
from app.preprocessing.preprocessing import ImagePreprocessor

def test_image_preprocessor():
    # Create synthetic test image
    img = Image.new("RGB", (200, 100), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.text((10, 10), "RS 40,000 Total: 82.50", fill=(0, 0, 0))

    preprocessor = ImagePreprocessor()
    processed_img = preprocessor.preprocess(img)

    assert isinstance(processed_img, Image.Image)
    assert processed_img.size == img.size
