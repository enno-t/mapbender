<?php


namespace Mapbender\PrintBundle\Component\Transport;


use Mapbender\Component\Transport\HttpTransportInterface;
use Mapbender\PrintBundle\Util\GdUtil;

/**
 * Bridge between http transport and GD image resource.
 */
class ImageTransport
{
    /** @var HttpTransportInterface */
    protected $baseTransport;

    /**
     * @param HttpTransportInterface $baseTransport
     */
    public function __construct(HttpTransportInterface $baseTransport)
    {
        $this->baseTransport = $baseTransport;
    }

    /**
     * Download given $url ~directly into a GD image resource, optionally also multiplying its
     * alpha by the given $opacity.
     *
     * @param string $url
     * @param float $opacity in [0;1]
     * @return resource|null GDish
     */
    public function downloadImage($url, $opacity=1.0)
    {
        try {
            $response = $this->baseTransport->getUrl($url);
            $content = $response->getContent();
            $image = imagecreatefromstring($content);
            if (!$image) {
                throw new \Exception("Could not create Image:\n URL:".$url."\n RETURNS:".$content);
            }
            imagesavealpha($image, true);
            if ($opacity <= (1.0 - 1 / 127)) {
                $multipliedImage = GdUtil::multiplyAlpha($image, $opacity);
                if ($multipliedImage !== $image) {
                    imagedestroy($image);
                }
                return $multipliedImage;
            } else {
                return $image;
            }
        } catch (\ErrorException $e) {
            return null;
        }
    }
}
