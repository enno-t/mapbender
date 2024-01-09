<?php


namespace Mapbender\CoreBundle\Element\Type;

use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\FormBuilderInterface;

class BaseButtonAdminType extends AbstractType
{
    /**
     * @inheritdoc
     */
    public function buildForm(FormBuilderInterface $builder, array $options)
    {
        $builder
            ->add('tooltip', 'Symfony\Component\Form\Extension\Core\Type\TextType', array(
                'required' => false,
                'label' => 'mb.core.basebutton.admin.tooltip',
            ))
            ->add('icon', 'Mapbender\CoreBundle\Element\Type\IconClassType', array(
                'required' => false,
                'label' => 'mb.core.basebutton.admin.icon',
            ))
            ->add('label', 'Symfony\Component\Form\Extension\Core\Type\CheckboxType', array(
                'required' => false,
                'label' => 'mb.core.admin.button.show_label',
            ))
        ;
    }
}
