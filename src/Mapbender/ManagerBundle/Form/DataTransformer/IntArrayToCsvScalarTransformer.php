<?php


namespace Mapbender\ManagerBundle\Form\DataTransformer;


class IntArrayToCsvScalarTransformer extends ArrayToCsvScalarTransformer
{
    public function reverseTransform($value): mixed
    {
        return array_map('\intval', parent::reverseTransform($value));
    }
}
