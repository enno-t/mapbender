<?php


namespace Mapbender\PrintBundle\Component;


class GdCanvas extends BaseCanvas
{
    /** @var resource Gdish */
    public $resource;

    public function __construct($width, $height)
    {
        $width = intval(round($width));
        $height = intval(round($height));
        if ($width <= 0 || $height <= 0) {
            throw new \InvalidArgumentException("Invalid width / height " . print_r(array($width, $height), true));
        }
        $this->resource = imagecreatetruecolor($width, $height);
        $bg = imagecolorallocate($this->resource, 255, 255, 255);
        imagefilledrectangle($this->resource, 0, 0, $width, $height, $bg);
        imagecolordeallocate($this->resource, $bg);
    }

    /**
     * @return int
     */
    public function getWidth()
    {
        return imagesx($this->resource);
    }

    /**
     * @return int
     */
    public function getHeight()
    {
        return imagesy($this->resource);
    }

    /**
     * @param float[][] $coordinates (pixel space)
     * @param int $color
     */
    public function drawPolygonOutline($coordinates, $color)
    {
        $pointsFlat = call_user_func_array('array_merge', $coordinates);
        imagepolygon($this->resource, $pointsFlat, count($coordinates), $color);
    }

    /**
     * @param float[][] $coordinates (pixel space)
     * @param int $color
     */
    public function drawPolygonBody($coordinates, $color)
    {
        $pointsFlat = call_user_func_array('array_merge', $coordinates);
        imagesetthickness($this->resource, 0);
        imagefilledpolygon($this->resource, $pointsFlat, count($coordinates), $color);
    }

    /**
     * @param float[][] $coordinates (pixel space)
     * @param int $color
     */
    public function drawLineString($coordinates, $color)
    {
        if (PHP_VERSION_ID >= 70200 && count($coordinates) > 2) {
            // imageopenpolygon supports continuous evaluation of IMG_COLOR_STYLED instructions
            // this makes it preferable to drawing a series of individual line, where style
            // evaluation restarts at each segment
            $pointsFlat = call_user_func_array('array_merge', $coordinates);
            imageopenpolygon($this->resource, $pointsFlat, count($coordinates), $color);
        } else {
            $from = $coordinates[0];
            foreach (array_slice($coordinates, 1) as $to) {
                imageline($this->resource, $from[0], $from[1], $to[0], $to[1], $color);
                $from = $to;
            }
        }
    }
}